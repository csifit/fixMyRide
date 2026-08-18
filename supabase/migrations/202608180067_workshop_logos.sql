begin;

alter table public.workshops
  add column if not exists logo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workshop-logos',
  'workshop-logos',
  true,
  2097152,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists workshop_logos_public_read on storage.objects;
create policy workshop_logos_public_read
on storage.objects for select
to anon, authenticated
using (bucket_id = 'workshop-logos');

drop policy if exists workshop_logos_manager_insert on storage.objects;
create policy workshop_logos_manager_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'workshop-logos'
  and exists (
    select 1 from public.workshops workshop
    where workshop.id::text = split_part(name, '/', 1)
      and workshop.claim_status in ('not_applicable', 'claimed')
      and private.can_manage_automotive_workshop(workshop.id)
  )
);

drop policy if exists workshop_logos_manager_update on storage.objects;
create policy workshop_logos_manager_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'workshop-logos'
  and exists (
    select 1 from public.workshops workshop
    where workshop.id::text = split_part(name, '/', 1)
      and workshop.claim_status in ('not_applicable', 'claimed')
      and private.can_manage_automotive_workshop(workshop.id)
  )
)
with check (
  bucket_id = 'workshop-logos'
  and exists (
    select 1 from public.workshops workshop
    where workshop.id::text = split_part(name, '/', 1)
      and workshop.claim_status in ('not_applicable', 'claimed')
      and private.can_manage_automotive_workshop(workshop.id)
  )
);

drop policy if exists workshop_logos_manager_delete on storage.objects;
create policy workshop_logos_manager_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'workshop-logos'
  and exists (
    select 1 from public.workshops workshop
    where workshop.id::text = split_part(name, '/', 1)
      and workshop.claim_status in ('not_applicable', 'claimed')
      and private.can_manage_automotive_workshop(workshop.id)
  )
);

create or replace function public.get_my_workshop_logo_settings()
returns table (
  workshop_id uuid,
  claim_status public.workshop_claim_status,
  logo_path text,
  logo_eligible boolean
)
language sql stable security definer set search_path = ''
as $$
  select workshop.id, workshop.claim_status, workshop.logo_path,
    workshop.claim_status in ('not_applicable', 'claimed')
  from public.workshops workshop
  where private.can_manage_automotive_workshop(workshop.id)
  order by workshop.display_name
$$;

revoke all on function public.get_my_workshop_logo_settings()
  from public, anon, authenticated;
grant execute on function public.get_my_workshop_logo_settings()
  to authenticated;

create or replace function public.set_my_workshop_logo_path(
  requested_workshop_id uuid,
  new_logo_path text
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.can_manage_automotive_workshop(requested_workshop_id) then
    raise exception using errcode = '42501', message = 'Not authorized.';
  end if;

  if not exists (
    select 1 from public.workshops workshop
    where workshop.id = requested_workshop_id
      and workshop.claim_status in ('not_applicable', 'claimed')
  ) then
    raise exception using errcode = '42501', message = 'Only claimed workshops can upload a logo.';
  end if;

  if new_logo_path is null
    or new_logo_path !~ ('^' || requested_workshop_id::text || '/logo-[0-9a-f-]{36}\.(jpg|jpeg|png)$') then
    raise exception using errcode = '22023', message = 'Invalid workshop logo path.';
  end if;

  update public.workshops
  set logo_path = new_logo_path, updated_at = now()
  where id = requested_workshop_id;
end;
$$;

revoke all on function public.set_my_workshop_logo_path(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_my_workshop_logo_path(uuid, text)
  to authenticated;

drop function public.search_public_workshops_v3(text, text);
create function public.search_public_workshops_v3(
  requested_search text default null,
  requested_service_code text default null
)
returns table (
  workshop_id uuid, workshop_slug text, display_name text, description text,
  country_code char(2), city text, practice_address text,
  latitude numeric, longitude numeric, public_phone text, public_email text,
  offers_pickup boolean, offers_courtesy_car boolean,
  service_categories text[], price_from_cents integer, logo_path text
)
language sql stable security definer set search_path = ''
as $$
  select workshop.id, workshop.slug, workshop.display_name,
    workshop.description, workshop.country_code, workshop.city,
    workshop.address, workshop.latitude, workshop.longitude,
    workshop.public_phone, workshop.public_email, workshop.offers_pickup,
    workshop.offers_courtesy_car,
    coalesce(summary.categories, array[]::text[]), summary.price_from_cents,
    workshop.logo_path
  from public.workshops workshop
  left join lateral (
    select array_agg(distinct service.category order by service.category) categories,
      min(service.price_from_cents) price_from_cents
    from public.workshop_services service
    where service.workshop_id = workshop.id and service.active
  ) summary on true
  where private.is_workshop_discoverable(workshop.id)
    and (nullif(btrim(requested_search), '') is null
      or concat_ws(' ', workshop.display_name, workshop.description,
        workshop.city, workshop.address,
        array_to_string(summary.categories, ' '))
        ilike '%' || btrim(requested_search) || '%')
    and (nullif(btrim(requested_service_code), '') is null or exists (
      select 1
      from public.workshop_services matching_service
      where matching_service.workshop_id = workshop.id
        and matching_service.active
        and matching_service.service_code = btrim(requested_service_code)
    ))
  order by workshop.display_name
$$;

revoke all on function public.search_public_workshops_v3(text, text)
  from public, anon, authenticated;
grant execute on function public.search_public_workshops_v3(text, text)
  to anon, authenticated;

comment on column public.workshops.logo_path is
  'Object path in the public workshop-logos bucket. Uploads are restricted to claimed or owner-created workshops.';

commit;
