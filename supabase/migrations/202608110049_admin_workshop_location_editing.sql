begin;

alter table public.platform_organisation_admin_history
  drop constraint platform_organisation_admin_history_action_check;
alter table public.platform_organisation_admin_history
  add constraint platform_organisation_admin_history_action_check check (action in (
    'organisation_invited', 'location_created', 'location_updated',
    'manager_invited', 'manager_assigned', 'account_status_changed'
  ));

create function public.get_admin_workshop_location_details()
returns table (
  workshop_id uuid,
  service_provider_id uuid,
  display_name text,
  status public.organization_status,
  city text,
  practice_address text,
  country_code char(2),
  latitude numeric,
  longitude numeric,
  public_phone text,
  public_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required'
      using errcode = '42501';
  end if;

  return query
  select workshop.id, workshop.service_provider_id, workshop.display_name,
    workshop.status, workshop.city, workshop.address, workshop.country_code,
    workshop.latitude, workshop.longitude, workshop.public_phone,
    workshop.public_email
  from public.workshops workshop
  order by workshop.display_name, workshop.id;
end;
$$;

revoke all on function public.get_admin_workshop_location_details()
  from public, anon, authenticated;
grant execute on function public.get_admin_workshop_location_details()
  to authenticated;

create function public.update_admin_workshop_location(
  requested_workshop_id uuid,
  requested_display_name text,
  requested_country_code text,
  requested_city text,
  requested_address text,
  requested_latitude numeric,
  requested_longitude numeric,
  requested_public_phone text,
  requested_public_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  workshop_row public.workshops%rowtype;
  normalized_country text := upper(btrim(requested_country_code));
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required'
      using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(requested_display_name, ''))) not between 2 and 160
    or normalized_country !~ '^[A-Z]{2}$'
    or char_length(btrim(coalesce(requested_city, ''))) not between 2 and 120
    or char_length(btrim(coalesce(requested_address, ''))) not between 3 and 240
    or requested_latitude is null or requested_latitude not between -90 and 90
    or requested_longitude is null or requested_longitude not between -180 and 180
    or (nullif(btrim(requested_public_phone), '') is not null
      and char_length(btrim(requested_public_phone)) not between 5 and 40)
    or (nullif(btrim(requested_public_email), '') is not null
      and char_length(btrim(requested_public_email)) not between 3 and 320) then
    raise exception 'Valid geocoded workshop location details are required'
      using errcode = '22023';
  end if;

  select workshop.* into workshop_row
  from public.workshops workshop
  where workshop.id = requested_workshop_id
  for update;

  if workshop_row.id is null then
    raise exception 'Workshop location not found' using errcode = '22023';
  end if;

  update public.workshops
  set display_name = btrim(requested_display_name),
    country_code = normalized_country,
    city = btrim(requested_city),
    address = btrim(requested_address),
    latitude = requested_latitude,
    longitude = requested_longitude,
    public_phone = nullif(btrim(requested_public_phone), ''),
    public_email = nullif(lower(btrim(requested_public_email)), '')
  where id = requested_workshop_id;

  actor_id := private.current_platform_administrator_id();
  insert into public.platform_organisation_admin_history (
    action, service_provider_id, workshop_id, actor_administrator_id, details
  ) values (
    'location_updated', workshop_row.service_provider_id,
    workshop_row.id, actor_id,
    jsonb_build_object(
      'previousDisplayName', workshop_row.display_name,
      'displayName', btrim(requested_display_name),
      'previousCoordinates', jsonb_build_array(
        workshop_row.latitude, workshop_row.longitude
      ),
      'coordinates', jsonb_build_array(
        requested_latitude, requested_longitude
      )
    )
  );
end;
$$;

revoke all on function public.update_admin_workshop_location(
  uuid, text, text, text, text, numeric, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.update_admin_workshop_location(
  uuid, text, text, text, text, numeric, numeric, text, text
) to authenticated;

comment on function public.update_admin_workshop_location(
  uuid, text, text, text, text, numeric, numeric, text, text
) is 'Allows an MFA-authenticated platform administrator to correct a workshop listing and its exact map coordinates without changing its stable public slug.';

commit;
