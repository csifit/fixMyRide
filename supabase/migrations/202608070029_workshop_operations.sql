begin;

alter table public.workshops
  add column time_zone text not null default 'Europe/Bucharest'
    check (time_zone in ('Europe/Bucharest', 'Europe/Budapest', 'Europe/Berlin')),
  add column minimum_lead_minutes integer not null default 120
    check (minimum_lead_minutes between 0 and 43200),
  add column booking_horizon_days integer not null default 60
    check (booking_horizon_days between 1 and 365),
  add column daily_booking_capacity integer not null default 8
    check (daily_booking_capacity between 1 and 200),
  add column slot_interval_minutes integer not null default 30
    check (slot_interval_minutes in (15, 30, 45, 60)),
  add column allows_wait_on_site boolean not null default true;

create table public.workshop_operating_hours (
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time,
  closes_at time,
  closed boolean not null default false,
  primary key (workshop_id, weekday),
  check (
    (closed and opens_at is null and closes_at is null)
    or (not closed and opens_at is not null and closes_at is not null and opens_at < closes_at)
  )
);

create table public.workshop_closures (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text check (reason is null or char_length(reason) <= 240),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index workshop_closures_time_idx
  on public.workshop_closures(workshop_id, starts_at, ends_at);

insert into public.workshop_operating_hours (
  workshop_id, weekday, opens_at, closes_at, closed
)
select workshop.id, day.weekday,
  case when day.weekday between 1 and 5 then time '08:00' end,
  case when day.weekday between 1 and 5 then time '17:00' end,
  day.weekday not between 1 and 5
from public.workshops workshop
cross join generate_series(0, 6) as day(weekday);

alter table public.workshop_operating_hours enable row level security;
alter table public.workshop_closures enable row level security;
revoke all on table public.workshop_operating_hours, public.workshop_closures
  from public, anon, authenticated;

create function private.can_manage_automotive_workshop(requested_workshop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workshops workshop
    join public.service_providers provider
      on provider.id = workshop.service_provider_id
    join public.workshop_manager_memberships membership
      on membership.service_provider_id = provider.id
      and membership.status = 'active'
      and membership.membership_role in ('owner', 'manager')
    join public.workshop_manager_profiles manager
      on manager.id = membership.workshop_manager_id
      and manager.status = 'active'
    where workshop.id = requested_workshop_id
      and manager.auth_user_id = (select auth.uid())
  )
$$;

revoke all on function private.can_manage_automotive_workshop(uuid)
  from public, anon, authenticated;

create policy workshop_operating_hours_manager_read
on public.workshop_operating_hours for select to authenticated
using (private.can_manage_automotive_workshop(workshop_id));

create policy workshop_closures_manager_read
on public.workshop_closures for select to authenticated
using (private.can_manage_automotive_workshop(workshop_id));

create function public.get_my_workshop_operations()
returns table (
  workshop_id uuid,
  service_provider_id uuid,
  service_provider_name text,
  display_name text,
  country_code char(2),
  workshop_status public.organization_status,
  description text,
  public_phone text,
  public_email text,
  city text,
  address text,
  latitude numeric,
  longitude numeric,
  accepts_booking_requests boolean,
  offers_pickup boolean,
  offers_courtesy_car boolean,
  allows_wait_on_site boolean,
  time_zone text,
  minimum_lead_minutes integer,
  booking_horizon_days integer,
  daily_booking_capacity integer,
  slot_interval_minutes integer,
  operating_hours jsonb,
  closures jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select workshop.id, provider.id, provider.display_name,
    workshop.display_name, workshop.country_code, workshop.status,
    workshop.description, workshop.public_phone, workshop.public_email,
    workshop.city, workshop.address, workshop.latitude, workshop.longitude,
    workshop.accepts_booking_requests, workshop.offers_pickup,
    workshop.offers_courtesy_car, workshop.allows_wait_on_site,
    workshop.time_zone, workshop.minimum_lead_minutes,
    workshop.booking_horizon_days, workshop.daily_booking_capacity,
    workshop.slot_interval_minutes,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekday', hours.weekday,
        'opensAt', hours.opens_at,
        'closesAt', hours.closes_at,
        'closed', hours.closed
      ) order by hours.weekday)
      from public.workshop_operating_hours hours
      where hours.workshop_id = workshop.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', closure.id,
        'startsAt', closure.starts_at,
        'endsAt', closure.ends_at,
        'reason', closure.reason
      ) order by closure.starts_at)
      from public.workshop_closures closure
      where closure.workshop_id = workshop.id
        and closure.ends_at > now()
    ), '[]'::jsonb)
  from public.workshops workshop
  join public.service_providers provider
    on provider.id = workshop.service_provider_id
  where private.can_manage_automotive_workshop(workshop.id)
  order by provider.display_name, workshop.display_name
$$;

revoke all on function public.get_my_workshop_operations()
  from public, anon, authenticated;
grant execute on function public.get_my_workshop_operations()
  to authenticated;

create function public.update_my_workshop_operations(
  requested_workshop_id uuid,
  new_display_name text,
  new_description text,
  new_public_phone text,
  new_public_email text,
  new_city text,
  new_address text,
  new_latitude numeric,
  new_longitude numeric,
  new_accepts_booking_requests boolean,
  new_offers_pickup boolean,
  new_offers_courtesy_car boolean,
  new_allows_wait_on_site boolean,
  new_time_zone text,
  new_minimum_lead_minutes integer,
  new_booking_horizon_days integer,
  new_daily_booking_capacity integer,
  new_slot_interval_minutes integer,
  new_operating_hours jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hours_row record;
begin
  if not private.can_manage_automotive_workshop(requested_workshop_id) then
    raise exception 'Workshop manager access required' using errcode = '42501';
  end if;
  if new_operating_hours is null
    or jsonb_typeof(new_operating_hours) is distinct from 'array'
    or jsonb_array_length(new_operating_hours) <> 7 then
    raise exception 'Exactly seven operating-hour rows are required'
      using errcode = '23514';
  end if;

  update public.workshops set
    display_name = btrim(new_display_name),
    description = nullif(btrim(new_description), ''),
    public_phone = nullif(btrim(new_public_phone), ''),
    public_email = nullif(lower(btrim(new_public_email)), ''),
    city = nullif(btrim(new_city), ''),
    address = nullif(btrim(new_address), ''),
    latitude = new_latitude,
    longitude = new_longitude,
    accepts_booking_requests = coalesce(new_accepts_booking_requests, false),
    offers_pickup = coalesce(new_offers_pickup, false),
    offers_courtesy_car = coalesce(new_offers_courtesy_car, false),
    allows_wait_on_site = coalesce(new_allows_wait_on_site, false),
    time_zone = btrim(new_time_zone),
    minimum_lead_minutes = new_minimum_lead_minutes,
    booking_horizon_days = new_booking_horizon_days,
    daily_booking_capacity = new_daily_booking_capacity,
    slot_interval_minutes = new_slot_interval_minutes
  where id = requested_workshop_id;

  delete from public.workshop_operating_hours
  where workshop_id = requested_workshop_id;

  for hours_row in
    select * from jsonb_to_recordset(new_operating_hours) as item(
      weekday smallint, "opensAt" time, "closesAt" time, closed boolean
    )
  loop
    insert into public.workshop_operating_hours (
      workshop_id, weekday, opens_at, closes_at, closed
    ) values (
      requested_workshop_id, hours_row.weekday,
      case when hours_row.closed then null else hours_row."opensAt" end,
      case when hours_row.closed then null else hours_row."closesAt" end,
      hours_row.closed
    );
  end loop;
end;
$$;

revoke all on function public.update_my_workshop_operations(
  uuid, text, text, text, text, text, text, numeric, numeric,
  boolean, boolean, boolean, boolean, text, integer, integer,
  integer, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.update_my_workshop_operations(
  uuid, text, text, text, text, text, text, numeric, numeric,
  boolean, boolean, boolean, boolean, text, integer, integer,
  integer, integer, jsonb
) to authenticated;

create function public.add_my_workshop_closure(
  requested_workshop_id uuid,
  requested_starts_at timestamptz,
  requested_ends_at timestamptz,
  requested_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare created_id uuid;
begin
  if not private.can_manage_automotive_workshop(requested_workshop_id) then
    raise exception 'Workshop manager access required' using errcode = '42501';
  end if;
  if requested_ends_at <= requested_starts_at or requested_ends_at <= now() then
    raise exception 'A future closure range is required' using errcode = '23514';
  end if;
  insert into public.workshop_closures (workshop_id, starts_at, ends_at, reason)
  values (
    requested_workshop_id, requested_starts_at, requested_ends_at,
    nullif(btrim(requested_reason), '')
  ) returning id into created_id;
  return created_id;
end;
$$;

revoke all on function public.add_my_workshop_closure(uuid, timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.add_my_workshop_closure(uuid, timestamptz, timestamptz, text)
  to authenticated;

create function public.remove_my_workshop_closure(requested_closure_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.workshop_closures closure
  where closure.id = requested_closure_id
    and private.can_manage_automotive_workshop(closure.workshop_id);
  if not found then
    raise exception 'Workshop closure is unavailable' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.remove_my_workshop_closure(uuid)
  from public, anon, authenticated;
grant execute on function public.remove_my_workshop_closure(uuid)
  to authenticated;

create or replace function public.search_public_workshops(requested_search text default null)
returns table (
  workshop_id uuid, display_name text, description text, country_code char(2),
  city text, practice_address text, latitude numeric, longitude numeric,
  public_phone text, public_email text, offers_pickup boolean,
  offers_courtesy_car boolean, service_categories text[], price_from_cents integer
)
language sql stable security definer set search_path = ''
as $$
  select workshop.id, workshop.display_name, workshop.description,
    workshop.country_code, workshop.city, workshop.address,
    workshop.latitude, workshop.longitude, workshop.public_phone,
    workshop.public_email, workshop.offers_pickup,
    workshop.offers_courtesy_car,
    coalesce(service_summary.categories, array[]::text[]),
    service_summary.price_from_cents
  from public.workshops workshop
  join public.service_providers provider
    on provider.id = workshop.service_provider_id
  left join lateral (
    select array_agg(distinct service.category order by service.category) categories,
      min(service.price_from_cents) price_from_cents
    from public.workshop_services service
    where service.workshop_id = workshop.legacy_workshop_profile_id
      and service.active
  ) service_summary on true
  where provider.status = 'active'
    and workshop.status = 'active'
    and workshop.accepts_booking_requests
    and workshop.legacy_workshop_profile_id is not null
    and (
      nullif(btrim(requested_search), '') is null
      or concat_ws(' ', workshop.display_name, workshop.description,
        workshop.city, workshop.address,
        array_to_string(service_summary.categories, ' '))
        ilike '%' || btrim(requested_search) || '%'
    )
  order by workshop.display_name
$$;

create or replace function public.get_public_workshop_services(requested_workshop_id uuid)
returns table (
  service_id uuid, name text, category text, description text,
  estimated_duration_minutes integer, price_from_cents integer,
  currency char(3), requires_diagnosis boolean
)
language sql stable security definer set search_path = ''
as $$
  select service.id, service.name, service.category, service.description,
    service.estimated_duration_minutes, service.price_from_cents,
    service.currency, service.requires_diagnosis
  from public.workshops workshop
  join public.service_providers provider
    on provider.id = workshop.service_provider_id
  join public.workshop_services service
    on service.workshop_id = workshop.legacy_workshop_profile_id
  where workshop.id = requested_workshop_id
    and provider.status = 'active'
    and workshop.status = 'active'
    and workshop.accepts_booking_requests
    and service.active
  order by service.display_order, service.name
$$;

create function public.get_public_workshop_booking_rules(requested_workshop_id uuid)
returns table (
  minimum_lead_minutes integer,
  booking_horizon_days integer,
  slot_interval_minutes integer,
  offers_pickup boolean,
  offers_courtesy_car boolean,
  allows_wait_on_site boolean,
  time_zone text,
  earliest_booking_date date,
  latest_booking_date date,
  operating_hours jsonb,
  closures jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select workshop.minimum_lead_minutes, workshop.booking_horizon_days,
    workshop.slot_interval_minutes, workshop.offers_pickup,
    workshop.offers_courtesy_car, workshop.allows_wait_on_site,
    workshop.time_zone,
    ((now() + make_interval(mins => workshop.minimum_lead_minutes)) at time zone workshop.time_zone)::date,
    ((now() + make_interval(days => workshop.booking_horizon_days)) at time zone workshop.time_zone)::date,
    coalesce((select jsonb_agg(jsonb_build_object(
      'weekday', hours.weekday, 'opensAt', hours.opens_at,
      'closesAt', hours.closes_at, 'closed', hours.closed
    ) order by hours.weekday) from public.workshop_operating_hours hours
      where hours.workshop_id = workshop.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'startsAt', closure.starts_at, 'endsAt', closure.ends_at
    ) order by closure.starts_at) from public.workshop_closures closure
      where closure.workshop_id = workshop.id and closure.ends_at > now()), '[]'::jsonb)
  from public.workshops workshop
  join public.service_providers provider on provider.id = workshop.service_provider_id
  where workshop.id = requested_workshop_id
    and workshop.status = 'active' and provider.status = 'active'
    and workshop.accepts_booking_requests
$$;

revoke all on function public.get_public_workshop_booking_rules(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_workshop_booking_rules(uuid)
  to anon, authenticated;

create or replace function public.create_public_service_booking_request(
  requested_workshop_id uuid, requested_service_id uuid,
  requested_customer_name text, requested_customer_phone text,
  requested_customer_email text, requested_vehicle_registration text,
  requested_vehicle_make text, requested_vehicle_model text,
  requested_vehicle_year integer, requested_mileage_km integer,
  requested_preferred_start timestamptz, requested_alternate_start timestamptz,
  requested_customer_note text, requested_mobility_requirement text,
  requested_locale text, requested_management_token_digest text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_request_id uuid;
  resolved_customer_id uuid;
  resolved_vehicle_id uuid;
  workshop_row public.workshops%rowtype;
  requested_local timestamp;
  requested_weekday smallint;
  open_time time;
  close_time time;
  requests_on_day integer;
begin
  select workshop.* into workshop_row
  from public.workshops workshop
  join public.service_providers provider
    on provider.id = workshop.service_provider_id
    and provider.status = 'active'
  where workshop.id = requested_workshop_id
    and workshop.status = 'active'
    and workshop.accepts_booking_requests
    and workshop.legacy_workshop_profile_id is not null
  for update of workshop;

  if workshop_row.id is null or not exists (
    select 1 from public.workshop_services service
    where service.id = requested_service_id
      and service.workshop_id = workshop_row.legacy_workshop_profile_id
      and service.active
  ) then
    raise exception 'Workshop service is unavailable' using errcode = 'P0002';
  end if;
  if requested_preferred_start < now() + make_interval(mins => workshop_row.minimum_lead_minutes)
    or requested_preferred_start > now() + make_interval(days => workshop_row.booking_horizon_days) then
    raise exception 'Requested time is outside the booking window' using errcode = '23514';
  end if;
  if requested_mobility_requirement = 'pickup' and not workshop_row.offers_pickup
    or requested_mobility_requirement = 'courtesy_car' and not workshop_row.offers_courtesy_car
    or requested_mobility_requirement = 'wait_on_site' and not workshop_row.allows_wait_on_site then
    raise exception 'Requested mobility option is unavailable' using errcode = '23514';
  end if;

  requested_local := requested_preferred_start at time zone workshop_row.time_zone;
  requested_weekday := extract(dow from requested_local)::smallint;
  if extract(minute from requested_local)::integer % workshop_row.slot_interval_minutes <> 0
    or extract(second from requested_local) <> 0 then
    raise exception 'Requested time does not match the workshop slot interval'
      using errcode = '23514';
  end if;
  select hours.opens_at, hours.closes_at into open_time, close_time
  from public.workshop_operating_hours hours
  where hours.workshop_id = workshop_row.id
    and hours.weekday = requested_weekday
    and not hours.closed;
  if open_time is null or requested_local::time < open_time
    or requested_local::time >= close_time then
    raise exception 'Workshop is closed at the requested time' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.workshop_closures closure
    where closure.workshop_id = workshop_row.id
      and requested_preferred_start >= closure.starts_at
      and requested_preferred_start < closure.ends_at
  ) then
    raise exception 'Workshop is closed at the requested time' using errcode = '23514';
  end if;

  select count(*) into requests_on_day
  from public.service_booking_requests booking
  where booking.workshop_id = workshop_row.legacy_workshop_profile_id
    and booking.status in ('requested', 'confirmed')
    and (coalesce(booking.confirmed_start, booking.preferred_start)
      at time zone workshop_row.time_zone)::date
      = requested_local::date;
  if requests_on_day >= workshop_row.daily_booking_capacity then
    raise exception 'Workshop booking capacity has been reached' using errcode = '23514';
  end if;

  select customer.id into resolved_customer_id
  from public.customer_profiles customer
  where customer.auth_user_id = (select auth.uid());
  if resolved_customer_id is not null then
    select vehicle.id into resolved_vehicle_id
    from public.vehicles vehicle
    where vehicle.customer_id = resolved_customer_id
      and upper(vehicle.registration_number) = upper(btrim(requested_vehicle_registration))
    limit 1;
  end if;

  insert into public.service_booking_requests (
    workshop_id, service_id, customer_id, vehicle_id,
    customer_name, customer_phone, customer_email,
    vehicle_registration, vehicle_make, vehicle_model, vehicle_year, mileage_km,
    preferred_start, alternate_start, customer_note, mobility_requirement,
    locale, management_token_digest
  ) values (
    workshop_row.legacy_workshop_profile_id, requested_service_id,
    resolved_customer_id, resolved_vehicle_id,
    btrim(requested_customer_name), btrim(requested_customer_phone),
    lower(btrim(requested_customer_email)),
    upper(btrim(requested_vehicle_registration)), btrim(requested_vehicle_make),
    btrim(requested_vehicle_model), requested_vehicle_year, requested_mileage_km,
    requested_preferred_start, requested_alternate_start,
    nullif(btrim(requested_customer_note), ''),
    nullif(requested_mobility_requirement, 'none'), requested_locale,
    decode(requested_management_token_digest, 'hex')
  ) returning id into created_request_id;
  return created_request_id;
end;
$$;

comment on table public.workshop_operating_hours is
  'Canonical weekly opening schedule used by workshop management and booking validation.';
comment on table public.workshop_closures is
  'Exceptional workshop closure periods that override weekly operating hours.';

commit;
