-- Automotive marketplace foundation.
-- Existing medical tables remain untouched during the staged product migration.

create type public.service_booking_status as enum (
  'requested',
  'confirmed',
  'checked_in',
  'diagnosing',
  'awaiting_approval',
  'in_service',
  'ready_for_collection',
  'completed',
  'declined',
  'cancelled',
  'no_show'
);

create table public.workshop_profiles (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null unique references public.clinics(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text check (description is null or char_length(description) <= 3000),
  public_phone text check (public_phone is null or char_length(public_phone) between 5 and 40),
  public_email text check (public_email is null or char_length(public_email) between 3 and 320),
  accepts_booking_requests boolean not null default true,
  offers_pickup boolean not null default false,
  offers_courtesy_car boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger workshop_profiles_updated_at before update on public.workshop_profiles
for each row execute function public.set_updated_at();

create table public.workshop_services (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshop_profiles(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 160),
  category text not null check (char_length(category) between 2 and 80),
  description text check (description is null or char_length(description) <= 1000),
  estimated_duration_minutes integer check (
    estimated_duration_minutes is null or estimated_duration_minutes between 15 and 2880
  ),
  price_from_cents integer check (price_from_cents is null or price_from_cents between 0 and 100000000),
  currency char(3) not null default 'EUR' check (currency = upper(currency)),
  requires_diagnosis boolean not null default false,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, name)
);

create index workshop_services_public_idx
  on public.workshop_services(workshop_id, active, display_order, name);
create trigger workshop_services_updated_at before update on public.workshop_services
for each row execute function public.set_updated_at();

create table public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  full_name text not null check (char_length(full_name) between 2 and 160),
  phone text check (phone is null or char_length(phone) between 7 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger customer_profiles_updated_at before update on public.customer_profiles
for each row execute function public.set_updated_at();

insert into public.customer_profiles (auth_user_id, full_name)
select patient.auth_user_id, patient.full_name
from public.patients patient
where patient.auth_user_id is not null
on conflict (auth_user_id) do update set full_name = excluded.full_name;

create function public.sync_customer_profile_from_patient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.auth_user_id is not null then
    insert into public.customer_profiles (auth_user_id, full_name)
    values (new.auth_user_id, new.full_name)
    on conflict (auth_user_id) do update
      set full_name = excluded.full_name, updated_at = now();
  end if;
  return new;
end;
$$;

create trigger patients_sync_customer_profile
after insert or update of auth_user_id, full_name on public.patients
for each row execute function public.sync_customer_profile_from_patient();

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  registration_number text not null check (char_length(registration_number) between 2 and 20),
  vin text check (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  make text not null check (char_length(make) between 1 and 80),
  model text not null check (char_length(model) between 1 and 100),
  production_year integer check (production_year is null or production_year between 1886 and 2200),
  engine_description text check (engine_description is null or char_length(engine_description) <= 120),
  fuel_type text check (fuel_type is null or fuel_type in ('petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'other')),
  current_mileage_km integer check (current_mileage_km is null or current_mileage_km between 0 and 5000000),
  nickname text check (nickname is null or char_length(nickname) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, registration_number)
);

create index vehicles_customer_idx on public.vehicles(customer_id, created_at desc);
create trigger vehicles_updated_at before update on public.vehicles
for each row execute function public.set_updated_at();

create table public.service_booking_requests (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshop_profiles(id) on delete restrict,
  service_id uuid not null references public.workshop_services(id) on delete restrict,
  customer_id uuid references public.customer_profiles(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  customer_name text not null check (char_length(customer_name) between 2 and 160),
  customer_phone text not null check (char_length(customer_phone) between 7 and 40),
  customer_email text not null check (char_length(customer_email) between 3 and 320),
  vehicle_registration text not null check (char_length(vehicle_registration) between 2 and 20),
  vehicle_make text not null check (char_length(vehicle_make) between 1 and 80),
  vehicle_model text not null check (char_length(vehicle_model) between 1 and 100),
  vehicle_year integer check (vehicle_year is null or vehicle_year between 1886 and 2200),
  mileage_km integer check (mileage_km is null or mileage_km between 0 and 5000000),
  preferred_start timestamptz not null,
  alternate_start timestamptz,
  customer_note text check (customer_note is null or char_length(customer_note) <= 2000),
  mobility_requirement text check (
    mobility_requirement is null or mobility_requirement in ('none', 'pickup', 'courtesy_car', 'wait_on_site')
  ),
  locale text not null default 'ro' check (locale in ('en', 'de', 'ro', 'hu')),
  status public.service_booking_status not null default 'requested',
  management_token_digest bytea not null unique,
  confirmed_start timestamptz,
  workshop_note text check (workshop_note is null or char_length(workshop_note) <= 2000),
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (alternate_start is null or alternate_start <> preferred_start),
  check (status <> 'confirmed' or confirmed_start is not null)
);

create index service_booking_requests_workshop_idx
  on public.service_booking_requests(workshop_id, status, preferred_start);
create index service_booking_requests_customer_idx
  on public.service_booking_requests(customer_id, preferred_start desc)
  where customer_id is not null;
create trigger service_booking_requests_updated_at before update on public.service_booking_requests
for each row execute function public.set_updated_at();

create table public.provider_subscription_plans (
  id text primary key,
  name text not null,
  monthly_price_cents integer not null check (monthly_price_cents >= 0),
  currency char(3) not null default 'EUR',
  sms_included boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.provider_subscription_plans
  (id, name, monthly_price_cents, currency, sms_included)
values ('standard', 'Service provider', 3500, 'EUR', true);

-- Keep the established invoicing engine, but make the automotive commercial
-- terms explicit: EUR 35/month and no separate SMS usage charge.
insert into public.billing_rates (effective_month, subscription_cents, sms_unit_cents)
values (date_trunc('month', current_date)::date, 3500, 0)
on conflict (effective_month) do update
set subscription_cents = excluded.subscription_cents,
    sms_unit_cents = excluded.sms_unit_cents,
    updated_at = now();

alter table public.workshop_profiles enable row level security;
alter table public.workshop_services enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.service_booking_requests enable row level security;
alter table public.provider_subscription_plans enable row level security;

revoke all on table public.workshop_profiles from public, anon, authenticated;
revoke all on table public.workshop_services from public, anon, authenticated;
revoke all on table public.customer_profiles from public, anon, authenticated;
revoke all on table public.vehicles from public, anon, authenticated;
revoke all on table public.service_booking_requests from public, anon, authenticated;
revoke all on table public.provider_subscription_plans from public, anon, authenticated;

grant select, insert, update, delete on table public.vehicles to authenticated;
grant select, insert, update on table public.customer_profiles to authenticated;
grant select on table public.service_booking_requests to authenticated;

create policy customer_profiles_own_profile on public.customer_profiles
for all to authenticated
using (auth_user_id = (select auth.uid()))
with check (auth_user_id = (select auth.uid()));

create policy vehicles_customer_owns_vehicle on public.vehicles
for all to authenticated
using (exists (
  select 1 from public.customer_profiles customer
  where customer.id = vehicles.customer_id
    and customer.auth_user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.customer_profiles customer
  where customer.id = vehicles.customer_id
    and customer.auth_user_id = (select auth.uid())
));

create policy service_booking_requests_customer_reads_own on public.service_booking_requests
for select to authenticated
using (exists (
  select 1 from public.customer_profiles customer
  where customer.id = service_booking_requests.customer_id
    and customer.auth_user_id = (select auth.uid())
));

-- Give existing organizations a usable automotive listing without rewriting
-- their identity or authentication records. Managers can refine these later.
insert into public.workshop_profiles (clinic_id, slug, description)
select
  clinic.id,
  trim(both '-' from lower(regexp_replace(clinic.display_name, '[^a-zA-Z0-9]+', '-', 'g')))
    || '-' || left(clinic.id::text, 8),
  null
from public.clinics clinic
on conflict (clinic_id) do nothing;

insert into public.workshop_services (
  workshop_id,
  name,
  category,
  description,
  estimated_duration_minutes,
  requires_diagnosis
)
select
  workshop.id,
  'General service request',
  'Diagnostics',
  'Tell the workshop what your vehicle needs. The final scope and time are confirmed after review.',
  60,
  true
from public.workshop_profiles workshop
on conflict (workshop_id, name) do nothing;

create function public.search_public_workshops(requested_search text default null)
returns table (
  workshop_id uuid,
  display_name text,
  description text,
  country_code char(2),
  city text,
  practice_address text,
  latitude numeric,
  longitude numeric,
  public_phone text,
  public_email text,
  offers_pickup boolean,
  offers_courtesy_car boolean,
  service_categories text[],
  price_from_cents integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    workshop.id,
    clinic.display_name,
    workshop.description,
    clinic.country_code,
    location.city,
    location.address,
    location.latitude,
    location.longitude,
    coalesce(workshop.public_phone, location.public_phone),
    coalesce(workshop.public_email, location.public_email),
    workshop.offers_pickup,
    workshop.offers_courtesy_car,
    coalesce(service_summary.categories, array[]::text[]),
    service_summary.price_from_cents
  from public.workshop_profiles workshop
  join public.clinics clinic on clinic.id = workshop.clinic_id
  left join lateral (
    select
      clinic_location.city,
      clinic_location.address,
      clinic_location.latitude,
      clinic_location.longitude,
      clinic_location.public_phone,
      clinic_location.public_email
    from public.clinic_locations clinic_location
    where clinic_location.clinic_id = clinic.id
      and clinic_location.status = 'active'
    order by clinic_location.active_from nulls last, clinic_location.created_at
    limit 1
  ) location on true
  left join lateral (
    select
      array_agg(distinct service.category order by service.category) as categories,
      min(service.price_from_cents) as price_from_cents
    from public.workshop_services service
    where service.workshop_id = workshop.id
      and service.active
  ) service_summary on true
  where clinic.status = 'active'
    and workshop.accepts_booking_requests
    and (
      nullif(trim(requested_search), '') is null
      or concat_ws(' ', clinic.display_name, workshop.description, location.city,
        location.address, array_to_string(service_summary.categories, ' '))
        ilike '%' || trim(requested_search) || '%'
    )
  order by clinic.display_name;
$$;

create function public.get_public_workshop_services(requested_workshop_id uuid)
returns table (
  service_id uuid,
  name text,
  category text,
  description text,
  estimated_duration_minutes integer,
  price_from_cents integer,
  currency char(3),
  requires_diagnosis boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    service.id,
    service.name,
    service.category,
    service.description,
    service.estimated_duration_minutes,
    service.price_from_cents,
    service.currency,
    service.requires_diagnosis
  from public.workshop_services service
  join public.workshop_profiles workshop on workshop.id = service.workshop_id
  join public.clinics clinic on clinic.id = workshop.clinic_id
  where workshop.id = requested_workshop_id
    and workshop.accepts_booking_requests
    and clinic.status = 'active'
    and service.active
  order by service.display_order, service.name;
$$;

create function public.create_public_service_booking_request(
  requested_workshop_id uuid,
  requested_service_id uuid,
  requested_customer_name text,
  requested_customer_phone text,
  requested_customer_email text,
  requested_vehicle_registration text,
  requested_vehicle_make text,
  requested_vehicle_model text,
  requested_vehicle_year integer,
  requested_mileage_km integer,
  requested_preferred_start timestamptz,
  requested_alternate_start timestamptz,
  requested_customer_note text,
  requested_mobility_requirement text,
  requested_locale text,
  requested_management_token_digest text
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
begin
  if requested_preferred_start <= now() then
    raise exception 'Requested time must be in the future' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.workshop_services service
    join public.workshop_profiles workshop on workshop.id = service.workshop_id
    join public.clinics clinic on clinic.id = workshop.clinic_id
    where service.id = requested_service_id
      and service.workshop_id = requested_workshop_id
      and service.active
      and workshop.accepts_booking_requests
      and clinic.status = 'active'
  ) then
    raise exception 'Workshop service is unavailable' using errcode = 'P0002';
  end if;

  select customer.id into resolved_customer_id
  from public.customer_profiles customer
  where customer.auth_user_id = auth.uid();

  if resolved_customer_id is not null then
    select vehicle.id into resolved_vehicle_id
    from public.vehicles vehicle
    where vehicle.customer_id = resolved_customer_id
      and upper(vehicle.registration_number) = upper(trim(requested_vehicle_registration))
    limit 1;
  end if;

  insert into public.service_booking_requests (
    workshop_id, service_id, customer_id, vehicle_id,
    customer_name, customer_phone, customer_email,
    vehicle_registration, vehicle_make, vehicle_model, vehicle_year, mileage_km,
    preferred_start, alternate_start, customer_note, mobility_requirement, locale,
    management_token_digest
  ) values (
    requested_workshop_id,
    requested_service_id,
    resolved_customer_id,
    resolved_vehicle_id,
    trim(requested_customer_name),
    trim(requested_customer_phone),
    lower(trim(requested_customer_email)),
    upper(trim(requested_vehicle_registration)),
    trim(requested_vehicle_make),
    trim(requested_vehicle_model),
    requested_vehicle_year,
    requested_mileage_km,
    requested_preferred_start,
    requested_alternate_start,
    nullif(trim(requested_customer_note), ''),
    nullif(requested_mobility_requirement, 'none'),
    requested_locale,
    decode(requested_management_token_digest, 'hex')
  )
  returning id into created_request_id;

  return created_request_id;
end;
$$;

revoke all on function public.search_public_workshops(text) from public;
revoke all on function public.get_public_workshop_services(uuid) from public;
revoke all on function public.create_public_service_booking_request(
  uuid, uuid, text, text, text, text, text, text, integer, integer,
  timestamptz, timestamptz, text, text, text, text
) from public;
grant execute on function public.search_public_workshops(text) to anon, authenticated;
grant execute on function public.get_public_workshop_services(uuid) to anon, authenticated;
grant execute on function public.create_public_service_booking_request(
  uuid, uuid, text, text, text, text, text, text, integer, integer,
  timestamptz, timestamptz, text, text, text, text
) to anon, authenticated;

comment on table public.workshop_profiles is 'Automotive workshop public and operational profile; clinic_id is a temporary compatibility bridge.';
comment on table public.service_booking_requests is 'Request-to-book workflow: a requested time is not confirmed until the workshop accepts it.';
comment on column public.provider_subscription_plans.sms_included is 'SMS lifecycle messages are included in the monthly provider price.';
