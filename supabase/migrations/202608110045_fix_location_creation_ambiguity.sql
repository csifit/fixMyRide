begin;

create or replace function public.create_admin_workshop_location(
  requested_service_provider_id uuid,
  requested_display_name text,
  requested_country_code text,
  requested_city text,
  requested_address text,
  requested_latitude numeric,
  requested_longitude numeric,
  requested_public_phone text,
  requested_public_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  created_workshop_id uuid := gen_random_uuid();
  normalized_country text := upper(btrim(requested_country_code));
  generated_slug text;
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(requested_display_name, ''))) not between 2 and 160
    or normalized_country !~ '^[A-Z]{2}$'
    or ((requested_latitude is null) <> (requested_longitude is null))
    or (requested_latitude is not null and requested_latitude not between -90 and 90)
    or (requested_longitude is not null and requested_longitude not between -180 and 180)
    or not exists (
      select 1 from public.service_providers provider
      where provider.id = requested_service_provider_id
        and provider.status in ('pending', 'active')
    ) then
    raise exception 'Valid workshop location details are required' using errcode = '22023';
  end if;

  generated_slug := coalesce(nullif(trim(both '-' from lower(regexp_replace(
    btrim(requested_display_name), '[^a-zA-Z0-9]+', '-', 'g'
  ))), ''), 'workshop') || '-' || left(created_workshop_id::text, 8);
  actor_id := private.current_platform_administrator_id();

  insert into public.workshops (
    id, service_provider_id, slug, display_name, country_code, status,
    city, address, latitude, longitude, public_phone, public_email
  ) values (
    created_workshop_id, requested_service_provider_id, generated_slug,
    btrim(requested_display_name), normalized_country, 'pending',
    nullif(btrim(requested_city), ''), nullif(btrim(requested_address), ''),
    requested_latitude, requested_longitude,
    nullif(btrim(requested_public_phone), ''),
    nullif(lower(btrim(requested_public_email)), '')
  );

  insert into public.workshop_operating_hours (
    workshop_id, weekday, opens_at, closes_at, closed
  )
  select created_workshop_id, day.weekday,
    case when day.weekday between 1 and 5 then time '08:00' end,
    case when day.weekday between 1 and 5 then time '17:00' end,
    day.weekday not between 1 and 5
  from generate_series(0, 6) as day(weekday)
  on conflict (workshop_id, weekday) do nothing;

  insert into public.platform_organisation_admin_history (
    action, service_provider_id, workshop_id, actor_administrator_id
  ) values (
    'location_created', requested_service_provider_id,
    created_workshop_id, actor_id
  );
  return created_workshop_id;
end;
$$;

create or replace function public.create_my_workshop_location(
  requested_service_provider_id uuid,
  requested_display_name text,
  requested_country_code text,
  requested_city text,
  requested_address text,
  requested_latitude numeric,
  requested_longitude numeric,
  requested_public_phone text,
  requested_public_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  manager_id uuid;
  created_workshop_id uuid := gen_random_uuid();
  normalized_country text := upper(btrim(requested_country_code));
  generated_slug text;
begin
  if not private.can_manage_service_organisation(requested_service_provider_id)
    or not exists (
      select 1 from public.service_providers provider
      where provider.id = requested_service_provider_id
        and provider.status = 'active'
    ) then
    raise exception 'Active service organisation owner access required'
      using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(requested_display_name, ''))) not between 2 and 160
    or normalized_country !~ '^[A-Z]{2}$'
    or nullif(btrim(coalesce(requested_city, '')), '') is null
    or nullif(btrim(coalesce(requested_address, '')), '') is null
    or requested_latitude is null or requested_latitude not between -90 and 90
    or requested_longitude is null or requested_longitude not between -180 and 180
    or (requested_public_email is not null
      and nullif(btrim(requested_public_email), '') is not null
      and requested_public_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Complete geocoded workshop location details are required'
      using errcode = '22023';
  end if;

  select manager.id into manager_id
  from public.workshop_manager_memberships membership
  join public.workshop_manager_profiles manager
    on manager.id = membership.workshop_manager_id
    and manager.status = 'active'
  join public.account_identities identity
    on identity.auth_user_id = manager.auth_user_id
    and identity.status = 'active'
  where membership.service_provider_id = requested_service_provider_id
    and membership.membership_role = 'owner'
    and membership.status = 'active'
    and manager.auth_user_id = (select auth.uid())
  limit 1;
  if manager_id is null then
    raise exception 'Service organisation owner account is unavailable'
      using errcode = '42501';
  end if;

  generated_slug := coalesce(nullif(trim(both '-' from lower(regexp_replace(
    btrim(requested_display_name), '[^a-zA-Z0-9]+', '-', 'g'
  ))), ''), 'workshop') || '-' || left(created_workshop_id::text, 8);

  insert into public.workshops (
    id, service_provider_id, slug, display_name, country_code, status,
    city, address, latitude, longitude, public_phone, public_email
  ) values (
    created_workshop_id, requested_service_provider_id, generated_slug,
    btrim(requested_display_name), normalized_country, 'pending',
    btrim(requested_city), btrim(requested_address),
    requested_latitude, requested_longitude,
    nullif(btrim(requested_public_phone), ''),
    nullif(lower(btrim(requested_public_email)), '')
  );

  insert into public.workshop_operating_hours (
    workshop_id, weekday, opens_at, closes_at, closed
  )
  select created_workshop_id, day.weekday,
    case when day.weekday between 1 and 5 then time '08:00' end,
    case when day.weekday between 1 and 5 then time '17:00' end,
    day.weekday not between 1 and 5
  from generate_series(0, 6) as day(weekday)
  on conflict (workshop_id, weekday) do nothing;

  insert into public.workshop_manager_assignments (
    workshop_id, workshop_manager_id, assignment_role, status
  ) values (created_workshop_id, manager_id, 'manager', 'active');

  return created_workshop_id;
end;
$$;

comment on function public.create_admin_workshop_location(
  uuid, text, text, text, text, numeric, numeric, text, text
) is 'Creates an administrator-managed workshop location using an unambiguous canonical workshop identifier.';
comment on function public.create_my_workshop_location(
  uuid, text, text, text, text, numeric, numeric, text, text
) is 'Creates an owner-managed workshop location using an unambiguous canonical workshop identifier.';

commit;
