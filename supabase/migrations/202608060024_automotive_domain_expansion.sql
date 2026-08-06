begin;

-- Expand-only automotive domain model. The running application continues to
-- use the legacy clinic-manager schema until a later, separately deployed
-- cutover. Compatibility triggers keep the target model synchronized.

create type public.platform_account_type as enum (
  'customer',
  'independent_service_provider',
  'workshop_manager',
  'workshop_staff',
  'platform_manager',
  'platform_admin',
  'superadmin'
);

create type public.workshop_manager_membership_role as enum (
  'owner',
  'manager'
);

create function private.map_legacy_account_type(
  legacy_type public.vitapass_account_type
)
returns public.platform_account_type
language sql
immutable
strict
set search_path = ''
as $$
  select case legacy_type::text
    when 'patient' then 'customer'::public.platform_account_type
    when 'doctor' then 'independent_service_provider'::public.platform_account_type
    when 'clinic_manager' then 'workshop_manager'::public.platform_account_type
    when 'staff' then 'workshop_staff'::public.platform_account_type
    when 'platform_manager' then 'platform_manager'::public.platform_account_type
    when 'platform_admin' then 'platform_admin'::public.platform_account_type
    when 'superadmin' then 'superadmin'::public.platform_account_type
  end
$$;

revoke all on function private.map_legacy_account_type(
  public.vitapass_account_type
) from public, anon, authenticated;

-- This shadow column proves that every live identity has a deterministic target
-- role without changing the column read by the current application.
alter table public.account_identities
  add column target_account_type public.platform_account_type;

update public.account_identities
set target_account_type = private.map_legacy_account_type(account_type);

alter table public.account_identities
  alter column target_account_type set not null;

create function private.sync_target_account_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.target_account_type := private.map_legacy_account_type(new.account_type);
  return new;
end;
$$;

revoke all on function private.sync_target_account_type()
  from public, anon, authenticated;

create trigger account_identities_sync_target_account_type
before insert or update of account_type on public.account_identities
for each row execute function private.sync_target_account_type();

create table public.service_providers (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (char_length(legal_name) between 2 and 200),
  display_name text not null check (char_length(display_name) between 2 and 160),
  country_code char(2) not null default 'RO'
    check (country_code = upper(country_code)),
  status public.organization_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger service_providers_updated_at
before update on public.service_providers
for each row execute function public.set_updated_at();

create table public.workshop_manager_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  display_name text not null check (char_length(display_name) between 2 and 160),
  status public.organization_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger workshop_manager_profiles_updated_at
before update on public.workshop_manager_profiles
for each row execute function public.set_updated_at();

create table public.workshop_manager_memberships (
  id uuid primary key default gen_random_uuid(),
  service_provider_id uuid not null
    references public.service_providers(id) on delete restrict,
  workshop_manager_id uuid not null
    references public.workshop_manager_profiles(id) on delete restrict,
  membership_role public.workshop_manager_membership_role not null,
  status public.organization_membership_status not null default 'active',
  starts_on date not null default current_date,
  ends_before date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_before is null or ends_before > starts_on)
);

create unique index workshop_manager_one_live_membership_idx
  on public.workshop_manager_memberships(
    service_provider_id, workshop_manager_id
  )
  where status in ('invited', 'active', 'suspended');

create trigger workshop_manager_memberships_updated_at
before update on public.workshop_manager_memberships
for each row execute function public.set_updated_at();

create table public.workshops (
  id uuid primary key default gen_random_uuid(),
  service_provider_id uuid not null
    references public.service_providers(id) on delete restrict,
  legacy_clinic_location_id uuid unique
    references public.clinic_locations(id) on delete set null,
  legacy_workshop_profile_id uuid unique
    references public.workshop_profiles(id) on delete set null,
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name text not null check (char_length(display_name) between 2 and 160),
  country_code char(2) not null default 'RO'
    check (country_code = upper(country_code)),
  status public.organization_status not null default 'pending',
  description text check (description is null or char_length(description) <= 3000),
  public_phone text check (
    public_phone is null or char_length(public_phone) between 5 and 40
  ),
  public_email text check (
    public_email is null or char_length(public_email) between 3 and 320
  ),
  city text check (city is null or char_length(city) between 2 and 120),
  address text check (address is null or char_length(address) between 3 and 240),
  latitude numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  accepts_booking_requests boolean not null default true,
  offers_pickup boolean not null default false,
  offers_courtesy_car boolean not null default false,
  active_from date,
  ends_before date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  check (ends_before is null or active_from is null or ends_before > active_from),
  check (status <> 'active' or active_from is not null)
);

create index workshops_provider_status_idx
  on public.workshops(service_provider_id, status, display_name);

create trigger workshops_updated_at
before update on public.workshops
for each row execute function public.set_updated_at();

-- Forward declaration used by the provider compatibility trigger below. It is
-- replaced with the deterministic consolidation implementation before any
-- synchronization triggers become visible outside this transaction.
create function private.refresh_automotive_workshops(
  requested_service_provider_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  return;
end;
$$;

revoke all on function private.refresh_automotive_workshops(uuid)
  from public, anon, authenticated;

-- Legacy organization/profile synchronization. These functions are private and
-- are invoked only by database triggers during the compatibility window.
create function private.sync_service_provider_from_clinic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.service_providers (
    id, legal_name, display_name, country_code, status, created_at, updated_at
  ) values (
    new.id, new.legal_name, new.display_name, new.country_code, new.status,
    new.created_at, new.updated_at
  )
  on conflict (id) do update set
    legal_name = excluded.legal_name,
    display_name = excluded.display_name,
    country_code = excluded.country_code,
    status = excluded.status,
    updated_at = excluded.updated_at;
  -- This function is defined later in the same transaction. Calling it here
  -- ensures provider changes are reflected after PostgreSQL's alphabetically
  -- ordered AFTER triggers have finished creating the legacy workshop profile.
  perform private.refresh_automotive_workshops(new.id);
  return new;
end;
$$;

revoke all on function private.sync_service_provider_from_clinic()
  from public, anon, authenticated;

create trigger clinics_sync_service_provider
after insert or update on public.clinics
for each row execute function private.sync_service_provider_from_clinic();

create function private.sync_workshop_manager_profile_from_legacy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workshop_manager_profiles (
    id, auth_user_id, display_name, status, created_at, updated_at
  ) values (
    new.id, new.auth_user_id, new.display_name, new.status,
    new.created_at, new.updated_at
  )
  on conflict (id) do update set
    auth_user_id = excluded.auth_user_id,
    display_name = excluded.display_name,
    status = excluded.status,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

revoke all on function private.sync_workshop_manager_profile_from_legacy()
  from public, anon, authenticated;

create trigger clinic_manager_profiles_sync_workshop_manager
after insert or update on public.clinic_manager_profiles
for each row execute function private.sync_workshop_manager_profile_from_legacy();

create function private.sync_workshop_manager_membership_from_legacy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workshop_manager_memberships (
    id, service_provider_id, workshop_manager_id, membership_role, status,
    starts_on, ends_before, created_at, updated_at
  ) values (
    new.id, new.clinic_id, new.clinic_manager_id,
    new.membership_role::text::public.workshop_manager_membership_role,
    new.status, new.starts_on, new.ends_before, new.created_at, new.updated_at
  )
  on conflict (id) do update set
    service_provider_id = excluded.service_provider_id,
    workshop_manager_id = excluded.workshop_manager_id,
    membership_role = excluded.membership_role,
    status = excluded.status,
    starts_on = excluded.starts_on,
    ends_before = excluded.ends_before,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

revoke all on function private.sync_workshop_manager_membership_from_legacy()
  from public, anon, authenticated;

create trigger clinic_manager_memberships_sync_workshop_manager
after insert or update on public.clinic_manager_memberships
for each row execute function private.sync_workshop_manager_membership_from_legacy();

-- Rebuild the target workshops for one provider. This is deterministic and may
-- be called repeatedly by location, profile, and organization triggers.
create or replace function private.refresh_automotive_workshops(
  requested_service_provider_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  provider_row public.service_providers%rowtype;
  profile_row public.workshop_profiles%rowtype;
  location_row public.clinic_locations%rowtype;
  primary_location_id uuid;
  base_slug text;
begin
  select provider.* into provider_row
  from public.service_providers provider
  where provider.id = requested_service_provider_id;

  if provider_row.id is null then
    return;
  end if;

  select profile.* into profile_row
  from public.workshop_profiles profile
  where profile.clinic_id = requested_service_provider_id;

  select location.id into primary_location_id
  from public.clinic_locations location
  where location.clinic_id = requested_service_provider_id
  order by (location.status = 'active') desc, location.created_at, location.id
  limit 1;

  base_slug := coalesce(
    profile_row.slug,
    coalesce(
      nullif(trim(both '-' from lower(regexp_replace(
        provider_row.display_name, '[^a-zA-Z0-9]+', '-', 'g'
      ))), ''),
      'workshop'
    ) || '-' || left(provider_row.id::text, 8)
  );

  if primary_location_id is null then
    if profile_row.id is not null then
      insert into public.workshops (
        id, service_provider_id, legacy_workshop_profile_id, slug,
        display_name, country_code, status, description, public_phone,
        public_email, accepts_booking_requests, offers_pickup,
        offers_courtesy_car, active_from, created_at, updated_at
      ) values (
        profile_row.id, provider_row.id, profile_row.id, base_slug,
        provider_row.display_name, provider_row.country_code,
        provider_row.status, profile_row.description, profile_row.public_phone,
        profile_row.public_email, profile_row.accepts_booking_requests,
        profile_row.offers_pickup, profile_row.offers_courtesy_car,
        case when provider_row.status = 'active'
          then provider_row.created_at::date else null end,
        profile_row.created_at, profile_row.updated_at
      )
      on conflict (id) do update set
        service_provider_id = excluded.service_provider_id,
        legacy_clinic_location_id = null,
        legacy_workshop_profile_id = excluded.legacy_workshop_profile_id,
        slug = excluded.slug,
        display_name = excluded.display_name,
        country_code = excluded.country_code,
        status = excluded.status,
        description = excluded.description,
        public_phone = excluded.public_phone,
        public_email = excluded.public_email,
        accepts_booking_requests = excluded.accepts_booking_requests,
        offers_pickup = excluded.offers_pickup,
        offers_courtesy_car = excluded.offers_courtesy_car,
        active_from = excluded.active_from,
        ends_before = null,
        updated_at = excluded.updated_at;
    end if;
    return;
  end if;

  -- Remove only an unused expansion fallback. Active application tables never
  -- reference public.workshops during this release.
  delete from public.workshops workshop
  where workshop.service_provider_id = requested_service_provider_id
    and workshop.legacy_clinic_location_id is null;

  -- Release the unique profile/slug values before a primary location changes.
  update public.workshops workshop set
    legacy_workshop_profile_id = null,
    slug = base_slug || '-' || left(workshop.id::text, 8)
  where workshop.service_provider_id = requested_service_provider_id;

  for location_row in
    select location.*
    from public.clinic_locations location
    where location.clinic_id = requested_service_provider_id
    order by location.created_at, location.id
  loop
    insert into public.workshops (
      id, service_provider_id, legacy_clinic_location_id,
      legacy_workshop_profile_id, slug, display_name, country_code, status,
      description, public_phone, public_email, city, address, latitude,
      longitude, accepts_booking_requests, offers_pickup,
      offers_courtesy_car, active_from, ends_before, created_at, updated_at
    ) values (
      location_row.id,
      provider_row.id,
      location_row.id,
      case when location_row.id = primary_location_id then profile_row.id end,
      case when location_row.id = primary_location_id then base_slug
        else base_slug || '-' || left(location_row.id::text, 8) end,
      location_row.display_name,
      location_row.country_code,
      location_row.status,
      case when location_row.id = primary_location_id
        then coalesce(profile_row.description, location_row.description)
        else location_row.description end,
      case when location_row.id = primary_location_id
        then coalesce(profile_row.public_phone, location_row.public_phone)
        else location_row.public_phone end,
      case when location_row.id = primary_location_id
        then coalesce(profile_row.public_email, location_row.public_email)
        else location_row.public_email end,
      location_row.city,
      location_row.address,
      location_row.latitude,
      location_row.longitude,
      case when location_row.id = primary_location_id
        then coalesce(profile_row.accepts_booking_requests, true) else true end,
      case when location_row.id = primary_location_id
        then coalesce(profile_row.offers_pickup, false) else false end,
      case when location_row.id = primary_location_id
        then coalesce(profile_row.offers_courtesy_car, false) else false end,
      location_row.active_from,
      location_row.ends_before,
      location_row.created_at,
      greatest(location_row.updated_at, coalesce(
        profile_row.updated_at, location_row.updated_at
      ))
    )
    on conflict (id) do update set
      service_provider_id = excluded.service_provider_id,
      legacy_clinic_location_id = excluded.legacy_clinic_location_id,
      legacy_workshop_profile_id = excluded.legacy_workshop_profile_id,
      slug = excluded.slug,
      display_name = excluded.display_name,
      country_code = excluded.country_code,
      status = excluded.status,
      description = excluded.description,
      public_phone = excluded.public_phone,
      public_email = excluded.public_email,
      city = excluded.city,
      address = excluded.address,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      accepts_booking_requests = excluded.accepts_booking_requests,
      offers_pickup = excluded.offers_pickup,
      offers_courtesy_car = excluded.offers_courtesy_car,
      active_from = excluded.active_from,
      ends_before = excluded.ends_before,
      updated_at = excluded.updated_at;
  end loop;
end;
$$;

revoke all on function private.refresh_automotive_workshops(uuid)
  from public, anon, authenticated;

create function private.refresh_automotive_workshops_from_clinic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_automotive_workshops(new.id);
  return new;
end;
$$;

create function private.refresh_automotive_workshops_from_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_automotive_workshops(new.clinic_id);
  return new;
end;
$$;

create function private.refresh_automotive_workshops_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_automotive_workshops(new.clinic_id);
  return new;
end;
$$;

revoke all on function private.refresh_automotive_workshops_from_clinic()
  from public, anon, authenticated;
revoke all on function private.refresh_automotive_workshops_from_location()
  from public, anon, authenticated;
revoke all on function private.refresh_automotive_workshops_from_profile()
  from public, anon, authenticated;

create trigger clinics_refresh_automotive_workshops
after insert or update on public.clinics
for each row execute function private.refresh_automotive_workshops_from_clinic();

create trigger clinic_locations_refresh_automotive_workshops
after insert or update on public.clinic_locations
for each row execute function private.refresh_automotive_workshops_from_location();

create trigger workshop_profiles_refresh_automotive_workshops
after insert or update on public.workshop_profiles
for each row execute function private.refresh_automotive_workshops_from_profile();

-- Deterministic initial copy. Target rows retain legacy UUIDs so later foreign
-- key cutover does not require public identifiers to change.
insert into public.service_providers (
  id, legal_name, display_name, country_code, status, created_at, updated_at
)
select clinic.id, clinic.legal_name, clinic.display_name, clinic.country_code,
  clinic.status, clinic.created_at, clinic.updated_at
from public.clinics clinic;

insert into public.workshop_manager_profiles (
  id, auth_user_id, display_name, status, created_at, updated_at
)
select manager.id, manager.auth_user_id, manager.display_name, manager.status,
  manager.created_at, manager.updated_at
from public.clinic_manager_profiles manager;

insert into public.workshop_manager_memberships (
  id, service_provider_id, workshop_manager_id, membership_role, status,
  starts_on, ends_before, created_at, updated_at
)
select membership.id, membership.clinic_id, membership.clinic_manager_id,
  membership.membership_role::text::public.workshop_manager_membership_role,
  membership.status, membership.starts_on, membership.ends_before,
  membership.created_at, membership.updated_at
from public.clinic_manager_memberships membership;

do $$
declare
  provider_id uuid;
begin
  for provider_id in select provider.id from public.service_providers provider
  loop
    perform private.refresh_automotive_workshops(provider_id);
  end loop;
end;
$$;

alter table public.service_providers enable row level security;
alter table public.workshops enable row level security;
alter table public.workshop_manager_profiles enable row level security;
alter table public.workshop_manager_memberships enable row level security;

create policy workshop_manager_profiles_read_self
on public.workshop_manager_profiles for select to authenticated
using (
  auth_user_id = (select auth.uid())
  or private.is_active_superadmin()
);

create policy workshop_manager_memberships_read_self
on public.workshop_manager_memberships for select to authenticated
using (
  exists (
    select 1
    from public.workshop_manager_profiles manager
    where manager.id = workshop_manager_id
      and manager.auth_user_id = (select auth.uid())
  )
  or private.is_active_superadmin()
);

create policy service_providers_read_member
on public.service_providers for select to authenticated
using (
  exists (
    select 1
    from public.workshop_manager_memberships membership
    join public.workshop_manager_profiles manager
      on manager.id = membership.workshop_manager_id
    where membership.service_provider_id = service_providers.id
      and membership.status = 'active'
      and manager.auth_user_id = (select auth.uid())
      and manager.status = 'active'
  )
  or private.is_active_superadmin()
);

create policy workshops_read_member
on public.workshops for select to authenticated
using (
  exists (
    select 1
    from public.workshop_manager_memberships membership
    join public.workshop_manager_profiles manager
      on manager.id = membership.workshop_manager_id
    where membership.service_provider_id = workshops.service_provider_id
      and membership.status = 'active'
      and manager.auth_user_id = (select auth.uid())
      and manager.status = 'active'
  )
  or private.is_active_superadmin()
);

revoke all on table public.service_providers,
  public.workshops,
  public.workshop_manager_profiles,
  public.workshop_manager_memberships
from public, anon, authenticated;

grant select on table public.service_providers,
  public.workshops,
  public.workshop_manager_profiles,
  public.workshop_manager_memberships
to authenticated;

comment on type public.platform_account_type is
  'Automotive account roles prepared for the post-VitaPass identity cutover.';
comment on column public.account_identities.target_account_type is
  'Expand-only shadow of the future automotive role; legacy account_type remains authoritative until cutover.';
comment on table public.service_providers is
  'Expand-only automotive legal/provider account synchronized from legacy clinics until cutover.';
comment on table public.workshops is
  'Expand-only physical bookable locations consolidating legacy clinic locations and workshop profiles.';
comment on table public.workshop_manager_profiles is
  'Expand-only workshop-manager identities synchronized from legacy clinic-manager profiles until cutover.';

commit;
