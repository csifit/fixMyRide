begin;

alter type public.service_booking_management_action
  add value if not exists 'manager_created';

commit;

begin;

alter table public.service_booking_requests
  alter column customer_phone drop not null,
  alter column customer_email drop not null,
  add column booking_source text not null default 'public_request'
    check (booking_source in (
      'public_request', 'manager_phone', 'manager_walk_in', 'manager_other'
    )),
  add column duration_minutes integer not null default 60
    check (duration_minutes between 15 and 1440);

create function public.create_managed_service_appointment(
  requested_workshop_profile_id uuid,
  requested_service_id uuid,
  requested_start timestamptz,
  requested_duration_minutes integer,
  requested_source text,
  requested_customer_name text,
  requested_customer_phone text,
  requested_customer_email text,
  requested_vehicle_registration text,
  requested_vehicle_make text,
  requested_vehicle_model text,
  requested_vehicle_year integer,
  requested_mileage_km integer,
  requested_note text,
  requested_locale text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  canonical_workshop_id uuid;
  manager_id uuid;
  created_booking_id uuid;
begin
  select workshop.id into canonical_workshop_id
  from public.workshops workshop
  where workshop.legacy_workshop_profile_id = requested_workshop_profile_id
    and workshop.status = 'active'
  order by workshop.created_at
  limit 1;

  if canonical_workshop_id is null
    or not private.can_manage_automotive_workshop(canonical_workshop_id) then
    raise exception 'Workshop manager access required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.workshop_services service
    where service.id = requested_service_id
      and service.workshop_id = requested_workshop_profile_id
      and service.active
  ) then
    raise exception 'Workshop service is unavailable' using errcode = 'P0002';
  end if;

  if requested_start < now() - interval '24 hours'
    or requested_duration_minutes not between 15 and 1440
    or requested_source not in ('manager_phone', 'manager_walk_in', 'manager_other')
    or requested_locale not in ('en', 'de', 'ro', 'hu') then
    raise exception 'Invalid manual appointment details' using errcode = '23514';
  end if;

  select manager.id into manager_id
  from public.workshop_manager_profiles manager
  where manager.auth_user_id = (select auth.uid())
    and manager.status = 'active';

  insert into public.service_booking_requests (
    workshop_id, service_id, customer_name, customer_phone, customer_email,
    vehicle_registration, vehicle_make, vehicle_model, vehicle_year,
    mileage_km, preferred_start, confirmed_start, customer_note, locale,
    status, management_token_digest, booking_source, duration_minutes
  ) values (
    requested_workshop_profile_id, requested_service_id,
    btrim(requested_customer_name), nullif(btrim(requested_customer_phone), ''),
    nullif(lower(btrim(requested_customer_email)), ''),
    upper(btrim(requested_vehicle_registration)), btrim(requested_vehicle_make),
    btrim(requested_vehicle_model), requested_vehicle_year,
    requested_mileage_km, requested_start, requested_start,
    nullif(btrim(requested_note), ''), requested_locale, 'confirmed',
    digest(gen_random_uuid()::text || clock_timestamp()::text, 'sha256'),
    requested_source, requested_duration_minutes
  ) returning id into created_booking_id;

  insert into public.service_booking_request_history (
    booking_request_id, action, previous_status, new_status,
    new_confirmed_start, note, actor_workshop_manager_id
  ) values (
    created_booking_id, 'manager_created', null, 'confirmed',
    requested_start, nullif(btrim(requested_note), ''), manager_id
  );

  return created_booking_id;
end;
$$;

revoke all on function public.create_managed_service_appointment(
  uuid, uuid, timestamptz, integer, text, text, text, text,
  text, text, text, integer, integer, text, text
) from public, anon, authenticated;
grant execute on function public.create_managed_service_appointment(
  uuid, uuid, timestamptz, integer, text, text, text, text,
  text, text, text, integer, integer, text, text
) to authenticated;

create function public.get_managed_service_booking_requests_v2(
  requested_status text default null
)
returns table (
  booking_id uuid, workshop_id uuid, workshop_name text,
  service_name text, service_category text,
  booking_status public.service_booking_status,
  customer_name text, customer_phone text, customer_email text,
  vehicle_registration text, vehicle_make text, vehicle_model text,
  vehicle_year integer, mileage_km integer,
  preferred_start timestamptz, alternate_start timestamptz,
  confirmed_start timestamptz, proposed_start timestamptz,
  proposal_note text, customer_note text, workshop_note text,
  mobility_requirement text, locale text, created_at timestamptz,
  history jsonb, booking_source text, duration_minutes integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select base.*, booking.booking_source, booking.duration_minutes
  from public.get_managed_service_booking_requests(requested_status) base
  join public.service_booking_requests booking on booking.id = base.booking_id
$$;

revoke all on function public.get_managed_service_booking_requests_v2(text)
  from public, anon, authenticated;
grant execute on function public.get_managed_service_booking_requests_v2(text)
  to authenticated;

comment on function public.create_managed_service_appointment(
  uuid, uuid, timestamptz, integer, text, text, text, text,
  text, text, text, integer, integer, text, text
) is 'Creates an immediately confirmed workshop appointment for a phone call, walk-in, or other manager-entered booking.';

commit;
