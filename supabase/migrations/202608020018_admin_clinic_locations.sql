begin;

create table public.clinic_locations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  display_name text not null check (char_length(display_name) between 2 and 160),
  country_code char(2) not null default 'RO' check (country_code = upper(country_code)),
  status public.organization_status not null default 'pending',
  description text check (description is null or char_length(description) <= 2000),
  public_phone text check (public_phone is null or char_length(public_phone) between 5 and 40),
  public_email text check (public_email is null or char_length(public_email) between 3 and 320),
  city text check (city is null or char_length(city) between 2 and 120),
  address text check (address is null or char_length(address) between 3 and 240),
  latitude numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  active_from date,
  ends_before date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  check (ends_before is null or active_from is null or ends_before > active_from),
  check (status <> 'active' or active_from is not null)
);

create index clinic_locations_organization_idx
  on public.clinic_locations(clinic_id, status, display_name);
create trigger clinic_locations_updated_at before update on public.clinic_locations
for each row execute function public.set_updated_at();

create table public.clinic_location_doctor_assignments (
  id uuid primary key default gen_random_uuid(),
  clinic_location_id uuid not null
    references public.clinic_locations(id) on delete restrict,
  clinician_id uuid not null references public.clinicians(id) on delete restrict,
  status public.organization_membership_status not null default 'active',
  starts_on date,
  ends_before date,
  assigned_by_administrator_id uuid
    references public.application_administrators(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_before is null or starts_on is null or ends_before > starts_on),
  check (status <> 'active' or starts_on is not null)
);

create unique index clinic_location_doctor_one_live_idx
  on public.clinic_location_doctor_assignments(clinic_location_id, clinician_id)
  where status in ('active', 'suspended');
create index clinic_location_doctor_dates_idx
  on public.clinic_location_doctor_assignments(clinician_id, starts_on, ends_before);
create trigger clinic_location_doctor_assignments_updated_at
before update on public.clinic_location_doctor_assignments
for each row execute function public.set_updated_at();

create table public.clinic_location_status_history (
  id uuid primary key default gen_random_uuid(),
  clinic_location_id uuid not null
    references public.clinic_locations(id) on delete restrict,
  previous_status public.organization_status,
  new_status public.organization_status not null,
  reason text check (reason is null or char_length(reason) <= 500),
  changed_by_administrator_id uuid
    references public.application_administrators(id) on delete restrict,
  changed_at timestamptz not null default now()
);

create index clinic_location_status_history_time_idx
  on public.clinic_location_status_history(clinic_location_id, changed_at desc);

alter table public.clinic_locations enable row level security;
alter table public.clinic_location_doctor_assignments enable row level security;
alter table public.clinic_location_status_history enable row level security;
revoke all on table public.clinic_locations,
  public.clinic_location_doctor_assignments,
  public.clinic_location_status_history
from public, anon, authenticated;

insert into public.clinic_locations (
  clinic_id, display_name, country_code, status, description,
  public_phone, public_email, city, address, latitude, longitude,
  active_from, ends_before, created_at, updated_at
)
select clinic.id, clinic.display_name, clinic.country_code, clinic.status,
  clinic.description, clinic.public_phone, clinic.public_email,
  clinic.city, clinic.address, clinic.latitude, clinic.longitude,
  case when clinic.status = 'active' then clinic.created_at::date else null end,
  null, clinic.created_at, clinic.updated_at
from public.clinics clinic;

insert into public.clinic_location_doctor_assignments (
  clinic_location_id, clinician_id, status, starts_on, ends_before,
  assigned_by_administrator_id, created_at, updated_at
)
select location.id, membership.clinician_id, membership.status,
  membership.starts_on, membership.ends_before, null,
  membership.created_at, membership.updated_at
from public.clinic_doctor_memberships membership
join lateral (
  select clinic_location.id
  from public.clinic_locations clinic_location
  where clinic_location.clinic_id = membership.clinic_id
  order by clinic_location.created_at, clinic_location.id
  limit 1
) location on true;

create function private.current_platform_administrator_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select administrator.id
  from public.application_administrators administrator
  where administrator.auth_user_id = (select auth.uid())
    and administrator.role::text in ('superadmin', 'admin')
    and administrator.status = 'active'
    and (select auth.jwt()->>'aal') = 'aal2'
  limit 1
$$;

revoke all on function private.current_platform_administrator_id()
  from public, anon, authenticated;

create function public.create_admin_clinic_location(
  requested_clinic_id uuid,
  new_display_name text,
  new_country_code text,
  new_description text,
  new_public_phone text,
  new_public_email text,
  new_city text,
  new_address text,
  new_latitude numeric,
  new_longitude numeric,
  new_status public.organization_status,
  new_active_from date,
  new_ends_before date,
  request_correlation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.current_platform_administrator_id();
  location_id uuid;
  organization_status public.organization_status;
begin
  if actor_id is null then raise insufficient_privilege; end if;
  select clinic.status into organization_status
  from public.clinics clinic where clinic.id = requested_clinic_id;
  if organization_status is null then
    raise exception 'Clinic organization not found' using errcode = 'P0002';
  end if;
  if new_status = 'active' and organization_status <> 'active' then
    raise exception 'Only an active organization can have an active location'
      using errcode = '23514';
  end if;
  insert into public.clinic_locations (
    clinic_id, display_name, country_code, description, public_phone,
    public_email, city, address, latitude, longitude, status,
    active_from, ends_before
  ) values (
    requested_clinic_id, btrim(new_display_name), upper(btrim(new_country_code)),
    nullif(btrim(new_description), ''), nullif(btrim(new_public_phone), ''),
    nullif(lower(btrim(new_public_email)), ''), nullif(btrim(new_city), ''),
    nullif(btrim(new_address), ''), new_latitude, new_longitude, new_status,
    case when new_status = 'active' then coalesce(new_active_from, current_date)
      else new_active_from end,
    new_ends_before
  ) returning id into location_id;
  insert into public.clinic_location_status_history (
    clinic_location_id, previous_status, new_status,
    changed_by_administrator_id
  ) values (location_id, null, new_status, actor_id);
  insert into public.audit_events (
    actor_auth_user_id, actor_administrator_id, action, resource_type,
    resource_id, correlation_id, safe_metadata
  ) values (
    auth.uid(), actor_id, 'clinic_created', 'clinic_locations',
    location_id, request_correlation_id,
    '{"changed_fields":["organization","display_name","location","status","active_dates"]}'::jsonb
  );
  return location_id;
end;
$$;

create function public.update_admin_clinic_location(
  requested_location_id uuid,
  new_display_name text,
  new_country_code text,
  new_description text,
  new_public_phone text,
  new_public_email text,
  new_city text,
  new_address text,
  new_latitude numeric,
  new_longitude numeric,
  new_status public.organization_status,
  new_active_from date,
  new_ends_before date,
  status_reason text,
  request_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.current_platform_administrator_id();
  previous_status public.organization_status;
  organization_status public.organization_status;
begin
  if actor_id is null then raise insufficient_privilege; end if;
  select location.status, clinic.status
    into previous_status, organization_status
  from public.clinic_locations location
  join public.clinics clinic on clinic.id = location.clinic_id
  where location.id = requested_location_id
  for update of location;
  if previous_status is null then
    raise exception 'Clinic location not found' using errcode = 'P0002';
  end if;
  if new_status = 'active' and organization_status <> 'active' then
    raise exception 'Only an active organization can have an active location'
      using errcode = '23514';
  end if;
  update public.clinic_locations location set
    display_name = btrim(new_display_name),
    country_code = upper(btrim(new_country_code)),
    description = nullif(btrim(new_description), ''),
    public_phone = nullif(btrim(new_public_phone), ''),
    public_email = nullif(lower(btrim(new_public_email)), ''),
    city = nullif(btrim(new_city), ''), address = nullif(btrim(new_address), ''),
    latitude = new_latitude, longitude = new_longitude, status = new_status,
    active_from = case when new_status = 'active'
      then coalesce(new_active_from, location.active_from, current_date)
      else coalesce(new_active_from, location.active_from) end,
    ends_before = case when new_status = 'active' then null
      when new_ends_before is not null then new_ends_before
      when new_status in ('suspended', 'rejected')
        then greatest(current_date, coalesce(location.active_from, current_date) + 1)
      else location.ends_before end
  where location.id = requested_location_id;
  if previous_status is distinct from new_status then
    insert into public.clinic_location_status_history (
      clinic_location_id, previous_status, new_status, reason,
      changed_by_administrator_id
    ) values (
      requested_location_id, previous_status, new_status,
      nullif(btrim(status_reason), ''), actor_id
    );
  end if;
  insert into public.audit_events (
    actor_auth_user_id, actor_administrator_id, action, resource_type,
    resource_id, correlation_id, safe_metadata
  ) values (
    auth.uid(), actor_id, 'clinic_updated', 'clinic_locations',
    requested_location_id, request_correlation_id,
    '{"changed_fields":["display_name","location","contact","status","active_dates"]}'::jsonb
  );
end;
$$;

create function public.set_admin_doctor_location_assignment(
  requested_location_id uuid,
  requested_clinician_id uuid,
  new_status public.organization_membership_status,
  new_starts_on date,
  new_ends_before date,
  request_correlation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.current_platform_administrator_id();
  assignment_id uuid;
  location_status public.organization_status;
begin
  if actor_id is null then raise insufficient_privilege; end if;
  select location.status into location_status
  from public.clinic_locations location
  where location.id = requested_location_id;
  if location_status is null or not exists (
    select 1 from public.clinicians clinician
    where clinician.id = requested_clinician_id
      and clinician.verification_status = 'approved'
  ) then
    raise exception 'Approved Doctor and location are required' using errcode = '23514';
  end if;
  if new_status = 'active' and location_status <> 'active' then
    raise exception 'Doctors can be assigned only to active locations'
      using errcode = '23514';
  end if;
  select assignment.id into assignment_id
  from public.clinic_location_doctor_assignments assignment
  where assignment.clinic_location_id = requested_location_id
    and assignment.clinician_id = requested_clinician_id
    and assignment.status in ('active', 'suspended')
  for update;
  if assignment_id is null then
    insert into public.clinic_location_doctor_assignments (
      clinic_location_id, clinician_id, status, starts_on, ends_before,
      assigned_by_administrator_id
    ) values (
      requested_location_id, requested_clinician_id, new_status,
      case when new_status = 'active' then coalesce(new_starts_on, current_date)
        else new_starts_on end,
      new_ends_before, actor_id
    ) returning id into assignment_id;
  else
    update public.clinic_location_doctor_assignments assignment set
      status = new_status,
      starts_on = case when new_status = 'active'
        then coalesce(assignment.starts_on, new_starts_on, current_date)
        else coalesce(new_starts_on, assignment.starts_on) end,
      ends_before = case when new_status = 'ended'
        then coalesce(new_ends_before,
          greatest(current_date, coalesce(assignment.starts_on, current_date) + 1))
        when new_status = 'active' then null else new_ends_before end
    where assignment.id = assignment_id;
  end if;
  insert into public.audit_events (
    actor_auth_user_id, actor_administrator_id, action, resource_type,
    resource_id, correlation_id, safe_metadata
  ) values (
    auth.uid(), actor_id, 'clinic_membership_updated',
    'clinic_location_doctor_assignments', assignment_id,
    request_correlation_id,
    '{"changed_fields":["doctor","location","status","active_dates"]}'::jsonb
  );
  return assignment_id;
end;
$$;

create function public.get_admin_clinic_operations_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.is_active_platform_admin() then jsonb_build_object(
    'count', (select count(*) from public.clinic_locations),
    'organizations', coalesce((select jsonb_agg(jsonb_build_object(
      'id', clinic.id, 'display_name', clinic.display_name,
      'legal_name', clinic.legal_name, 'country_code', clinic.country_code,
      'status', clinic.status) order by clinic.display_name)
      from public.clinics clinic), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(jsonb_build_object(
      'id', location.id, 'clinic_id', location.clinic_id,
      'organization_name', clinic.display_name,
      'display_name', location.display_name, 'country_code', location.country_code,
      'status', location.status, 'description', location.description,
      'public_phone', location.public_phone, 'public_email', location.public_email,
      'city', location.city, 'address', location.address,
      'latitude', location.latitude, 'longitude', location.longitude,
      'active_from', location.active_from, 'ends_before', location.ends_before,
      'assignments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', assignment.id, 'clinician_id', assignment.clinician_id,
        'doctor_name', clinician.full_name, 'status', assignment.status,
        'starts_on', assignment.starts_on, 'ends_before', assignment.ends_before)
        order by clinician.full_name)
        from public.clinic_location_doctor_assignments assignment
        join public.clinicians clinician on clinician.id = assignment.clinician_id
        where assignment.clinic_location_id = location.id), '[]'::jsonb),
      'status_history', coalesce((select jsonb_agg(jsonb_build_object(
        'previous_status', history.previous_status, 'new_status', history.new_status,
        'reason', history.reason, 'changed_at', history.changed_at)
        order by history.changed_at desc)
        from public.clinic_location_status_history history
        where history.clinic_location_id = location.id), '[]'::jsonb),
      'created_at', location.created_at) order by location.created_at desc)
      from public.clinic_locations location
      join public.clinics clinic on clinic.id = location.clinic_id), '[]'::jsonb)
  ) else null end
$$;

create or replace function public.get_my_doctor_workspace()
returns table (
  clinician_id uuid, full_name text, specialty text, professional_bio text,
  public_phone text, public_email text, years_experience smallint,
  spoken_languages text[], accepts_new_patients boolean,
  sponsored_clinic_id uuid, clinic_name text, clinic_country text, city text,
  practice_address text, latitude numeric, longitude numeric,
  is_independent boolean, can_edit_workspace boolean, can_edit_billing boolean
)
language sql stable security definer set search_path = ''
as $$
  select clinician.id, clinician.full_name, clinician.specialty,
    clinician.professional_bio, clinician.public_phone, clinician.public_email,
    clinician.years_experience, clinician.spoken_languages,
    clinician.accepts_new_patients, sponsored.clinic_id,
    coalesce(location.display_name, organization_location.display_name,
      clinic.display_name, clinician.clinic_name),
    coalesce(location.country_code::text, organization_location.country_code::text,
      clinic.country_code::text, clinician.clinic_country::text),
    coalesce(location.city, organization_location.city, clinic.city, clinician.city),
    coalesce(location.address, organization_location.address, clinic.address, clinician.practice_address),
    coalesce(location.latitude, organization_location.latitude, clinic.latitude, clinician.latitude),
    coalesce(location.longitude, organization_location.longitude, clinic.longitude, clinician.longitude),
    sponsored.clinic_id is null,
    sponsored.clinic_id is null and location.id is null,
    sponsored.clinic_id is null
  from public.clinicians clinician
  left join lateral (
    select period.clinic_id from public.clinic_sponsorship_periods period
    join public.clinic_doctor_memberships membership
      on membership.clinic_id = period.clinic_id
      and membership.clinician_id = period.clinician_id and membership.status = 'active'
    where period.clinician_id = clinician.id and period.effective_from <= current_date
      and (period.effective_until is null or period.effective_until > current_date)
    order by period.effective_from desc limit 1
  ) sponsored on true
  left join public.clinics clinic on clinic.id = sponsored.clinic_id
  left join lateral (
    select assigned_location.* from public.clinic_location_doctor_assignments assignment
    join public.clinic_locations assigned_location on assigned_location.id = assignment.clinic_location_id
    where assignment.clinician_id = clinician.id and assignment.status = 'active'
      and assignment.starts_on <= current_date
      and (assignment.ends_before is null or assignment.ends_before > current_date)
      and assigned_location.status = 'active' and assigned_location.active_from <= current_date
      and (assigned_location.ends_before is null or assigned_location.ends_before > current_date)
    order by assignment.starts_on desc limit 1
  ) location on true
  left join lateral (
    select fallback.* from public.clinic_locations fallback
    where fallback.clinic_id = sponsored.clinic_id and fallback.status = 'active'
      and fallback.active_from <= current_date
      and (fallback.ends_before is null or fallback.ends_before > current_date)
    order by fallback.active_from, fallback.created_at limit 1
  ) organization_location on location.id is null
  where clinician.auth_user_id = (select auth.uid())
    and clinician.verification_status = 'approved'
  limit 1
$$;

create or replace function public.search_public_doctors(requested_search text default null)
returns table (
  clinician_id uuid, full_name text, specialty text, clinic_name text,
  clinic_country text, city text, practice_address text, latitude numeric,
  longitude numeric, professional_bio text, public_phone text, public_email text,
  years_experience smallint, spoken_languages text[], accepts_new_patients boolean,
  is_clinic_sponsored boolean
)
language sql stable security definer set search_path = ''
as $$
  select clinician.id, clinician.full_name, clinician.specialty,
    coalesce(location.display_name, organization_location.display_name, clinic.display_name, clinician.clinic_name),
    coalesce(location.country_code::text, organization_location.country_code::text, clinic.country_code::text, clinician.clinic_country::text),
    coalesce(location.city, organization_location.city, clinic.city, clinician.city),
    coalesce(location.address, organization_location.address, clinic.address, clinician.practice_address),
    coalesce(location.latitude, organization_location.latitude, clinic.latitude, clinician.latitude),
    coalesce(location.longitude, organization_location.longitude, clinic.longitude, clinician.longitude),
    clinician.professional_bio,
    coalesce(clinician.public_phone, location.public_phone, organization_location.public_phone, clinic.public_phone),
    coalesce(clinician.public_email, location.public_email, organization_location.public_email, clinic.public_email),
    clinician.years_experience, clinician.spoken_languages,
    clinician.accepts_new_patients, sponsored.clinic_id is not null
  from public.clinicians clinician
  left join lateral (
    select period.clinic_id from public.clinic_sponsorship_periods period
    join public.clinic_doctor_memberships membership
      on membership.clinic_id = period.clinic_id
      and membership.clinician_id = period.clinician_id and membership.status = 'active'
    where period.clinician_id = clinician.id and period.effective_from <= current_date
      and (period.effective_until is null or period.effective_until > current_date)
    order by period.effective_from desc limit 1
  ) sponsored on true
  left join public.clinics clinic on clinic.id = sponsored.clinic_id
  left join lateral (
    select assigned_location.* from public.clinic_location_doctor_assignments assignment
    join public.clinic_locations assigned_location on assigned_location.id = assignment.clinic_location_id
    where assignment.clinician_id = clinician.id and assignment.status = 'active'
      and assignment.starts_on <= current_date
      and (assignment.ends_before is null or assignment.ends_before > current_date)
      and assigned_location.status = 'active' and assigned_location.active_from <= current_date
      and (assigned_location.ends_before is null or assigned_location.ends_before > current_date)
    order by assignment.starts_on desc limit 1
  ) location on true
  left join lateral (
    select fallback.* from public.clinic_locations fallback
    where fallback.clinic_id = sponsored.clinic_id and fallback.status = 'active'
      and fallback.active_from <= current_date
      and (fallback.ends_before is null or fallback.ends_before > current_date)
    order by fallback.active_from, fallback.created_at limit 1
  ) organization_location on location.id is null
  where clinician.verification_status = 'approved'
    and (nullif(btrim(requested_search), '') is null or concat_ws(' ',
      clinician.full_name, clinician.specialty,
      coalesce(location.display_name, organization_location.display_name, clinic.display_name, clinician.clinic_name),
      coalesce(location.city, organization_location.city, clinic.city, clinician.city),
      coalesce(location.address, organization_location.address, clinic.address, clinician.practice_address))
      ilike '%' || btrim(requested_search) || '%')
  order by clinician.full_name limit 100
$$;

revoke all on function public.create_admin_clinic_location(
  uuid, text, text, text, text, text, text, text, numeric, numeric,
  public.organization_status, date, date, uuid
) from public, anon, authenticated;
grant execute on function public.create_admin_clinic_location(
  uuid, text, text, text, text, text, text, text, numeric, numeric,
  public.organization_status, date, date, uuid
) to authenticated;
revoke all on function public.update_admin_clinic_location(
  uuid, text, text, text, text, text, text, text, numeric, numeric,
  public.organization_status, date, date, text, uuid
) from public, anon, authenticated;
grant execute on function public.update_admin_clinic_location(
  uuid, text, text, text, text, text, text, text, numeric, numeric,
  public.organization_status, date, date, text, uuid
) to authenticated;
revoke all on function public.set_admin_doctor_location_assignment(
  uuid, uuid, public.organization_membership_status, date, date, uuid
) from public, anon, authenticated;
grant execute on function public.set_admin_doctor_location_assignment(
  uuid, uuid, public.organization_membership_status, date, date, uuid
) to authenticated;
revoke all on function public.get_admin_clinic_operations_snapshot()
  from public, anon, authenticated;
grant execute on function public.get_admin_clinic_operations_snapshot()
  to authenticated;

comment on table public.clinic_locations is
  'Physical clinic locations are separate from clinic organizations and are never hard-deleted.';
comment on table public.clinic_location_doctor_assignments is
  'Dated Doctor-to-location assignments. Payment sponsorship remains a separate relationship.';

commit;
