-- Provider-managed workshop service catalogue.

create function public.ensure_workshop_profile_for_clinic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workshop_profiles (clinic_id, slug)
  values (
    new.id,
    coalesce(
      nullif(trim(both '-' from lower(regexp_replace(new.display_name, '[^a-zA-Z0-9]+', '-', 'g'))), ''),
      'workshop'
    ) || '-' || left(new.id::text, 8)
  )
  on conflict (clinic_id) do nothing;
  return new;
end;
$$;

revoke all on function public.ensure_workshop_profile_for_clinic()
  from public, anon, authenticated;

create trigger clinics_ensure_workshop_profile
after insert on public.clinics
for each row execute function public.ensure_workshop_profile_for_clinic();

insert into public.workshop_profiles (clinic_id, slug)
select
  clinic.id,
  coalesce(
    nullif(trim(both '-' from lower(regexp_replace(clinic.display_name, '[^a-zA-Z0-9]+', '-', 'g'))), ''),
    'workshop'
  ) || '-' || left(clinic.id::text, 8)
from public.clinics clinic
on conflict (clinic_id) do nothing;

create function private.can_manage_workshop(requested_workshop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workshop_profiles workshop
    join public.clinic_manager_memberships membership
      on membership.clinic_id = workshop.clinic_id
    join public.clinic_manager_profiles manager
      on manager.id = membership.clinic_manager_id
    where workshop.id = requested_workshop_id
      and membership.status = 'active'
      and membership.membership_role in ('owner', 'manager')
      and manager.auth_user_id = (select auth.uid())
      and manager.status = 'active'
  )
$$;

revoke all on function private.can_manage_workshop(uuid)
  from public, anon, authenticated;

create function public.get_my_workshop_service_catalogue()
returns table (
  workshop_id uuid,
  clinic_id uuid,
  workshop_name text,
  service_id uuid,
  service_name text,
  category text,
  description text,
  estimated_duration_minutes integer,
  price_from_cents integer,
  currency char(3),
  requires_diagnosis boolean,
  active boolean,
  display_order integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    workshop.id,
    clinic.id,
    clinic.display_name,
    service.id,
    service.name,
    service.category,
    service.description,
    service.estimated_duration_minutes,
    service.price_from_cents,
    service.currency,
    service.requires_diagnosis,
    service.active,
    service.display_order
  from public.clinic_manager_profiles manager
  join public.clinic_manager_memberships membership
    on membership.clinic_manager_id = manager.id
    and membership.status = 'active'
    and membership.membership_role in ('owner', 'manager')
  join public.clinics clinic on clinic.id = membership.clinic_id
  join public.workshop_profiles workshop on workshop.clinic_id = clinic.id
  left join public.workshop_services service on service.workshop_id = workshop.id
  where manager.auth_user_id = (select auth.uid())
    and manager.status = 'active'
  order by clinic.display_name, service.display_order nulls last,
    service.name nulls last
$$;

revoke all on function public.get_my_workshop_service_catalogue()
  from public, anon, authenticated;
grant execute on function public.get_my_workshop_service_catalogue()
  to authenticated;

create function public.create_managed_workshop_service(
  requested_clinic_id uuid,
  new_name text,
  new_category text,
  new_description text,
  new_estimated_duration_minutes integer,
  new_price_from_cents integer,
  new_currency text,
  new_requires_diagnosis boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_workshop_id uuid;
  created_service_id uuid;
  next_display_order integer;
begin
  if not exists (
    select 1
    from public.clinic_manager_memberships membership
    join public.clinic_manager_profiles manager
      on manager.id = membership.clinic_manager_id
    where membership.clinic_id = requested_clinic_id
      and membership.status = 'active'
      and membership.membership_role in ('owner', 'manager')
      and manager.auth_user_id = (select auth.uid())
      and manager.status = 'active'
  ) then
    raise exception 'Workshop manager access required' using errcode = '42501';
  end if;

  select workshop.id into resolved_workshop_id
  from public.workshop_profiles workshop
  where workshop.clinic_id = requested_clinic_id;

  if resolved_workshop_id is null then
    insert into public.workshop_profiles (clinic_id, slug)
    select clinic.id,
      coalesce(
        nullif(trim(both '-' from lower(regexp_replace(clinic.display_name, '[^a-zA-Z0-9]+', '-', 'g'))), ''),
        'workshop'
      ) || '-' || left(clinic.id::text, 8)
    from public.clinics clinic
    where clinic.id = requested_clinic_id
    returning id into resolved_workshop_id;
  end if;

  select coalesce(max(service.display_order), -1) + 1
    into next_display_order
  from public.workshop_services service
  where service.workshop_id = resolved_workshop_id;

  insert into public.workshop_services (
    workshop_id, name, category, description,
    estimated_duration_minutes, price_from_cents, currency,
    requires_diagnosis, display_order
  ) values (
    resolved_workshop_id, btrim(new_name), btrim(new_category),
    nullif(btrim(new_description), ''), new_estimated_duration_minutes,
    new_price_from_cents, upper(btrim(new_currency)),
    coalesce(new_requires_diagnosis, false), next_display_order
  ) returning id into created_service_id;

  return created_service_id;
end;
$$;

revoke all on function public.create_managed_workshop_service(
  uuid, text, text, text, integer, integer, text, boolean
) from public, anon, authenticated;
grant execute on function public.create_managed_workshop_service(
  uuid, text, text, text, integer, integer, text, boolean
) to authenticated;

create function public.update_managed_workshop_service(
  requested_service_id uuid,
  new_name text,
  new_category text,
  new_description text,
  new_estimated_duration_minutes integer,
  new_price_from_cents integer,
  new_currency text,
  new_requires_diagnosis boolean,
  new_display_order integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.workshop_services service set
    name = btrim(new_name),
    category = btrim(new_category),
    description = nullif(btrim(new_description), ''),
    estimated_duration_minutes = new_estimated_duration_minutes,
    price_from_cents = new_price_from_cents,
    currency = upper(btrim(new_currency)),
    requires_diagnosis = coalesce(new_requires_diagnosis, false),
    display_order = new_display_order
  where service.id = requested_service_id
    and private.can_manage_workshop(service.workshop_id);

  if not found then
    raise exception 'Workshop service is unavailable' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.update_managed_workshop_service(
  uuid, text, text, text, integer, integer, text, boolean, integer
) from public, anon, authenticated;
grant execute on function public.update_managed_workshop_service(
  uuid, text, text, text, integer, integer, text, boolean, integer
) to authenticated;

create function public.set_managed_workshop_service_active(
  requested_service_id uuid,
  new_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.workshop_services service
  set active = new_active
  where service.id = requested_service_id
    and private.can_manage_workshop(service.workshop_id);

  if not found then
    raise exception 'Workshop service is unavailable' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.set_managed_workshop_service_active(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_managed_workshop_service_active(uuid, boolean)
  to authenticated;
