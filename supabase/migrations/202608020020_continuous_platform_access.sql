begin;

-- Relationship dates are retained only as historical metadata. Active platform
-- access is controlled by explicit lifecycle status, never by a calendar date
-- or a billing/payment status.
update public.clinic_manager_memberships
set starts_on = coalesce(starts_on, current_date), ends_before = null
where status = 'active';

update public.clinic_doctor_memberships
set starts_on = coalesce(starts_on, current_date), ends_before = null
where status = 'active';

update public.staff_doctor_assignments
set starts_on = coalesce(starts_on, current_date), ends_before = null
where status = 'active';

update public.clinic_locations
set active_from = coalesce(active_from, current_date), ends_before = null
where status = 'active';

update public.clinic_location_doctor_assignments
set starts_on = coalesce(starts_on, current_date), ends_before = null
where status = 'active';

create or replace function private.can_manage_doctor_appointments(
  requested_clinician_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.current_appointment_actor() actor
    where actor.clinician_id = requested_clinician_id
      or exists (
        select 1
        from public.staff_doctor_assignments assignment
        where assignment.staff_id = actor.staff_id
          and assignment.clinician_id = requested_clinician_id
          and assignment.status = 'active'
      )
  )
$$;

revoke all on function private.can_manage_doctor_appointments(uuid)
  from public, anon, authenticated;

create or replace function private.staff_has_patient_access(requested_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_profiles staff
    join public.staff_doctor_assignments assignment
      on assignment.staff_id = staff.id
    join public.patient_access_grants grant_row
      on grant_row.clinician_id = assignment.clinician_id
    where staff.auth_user_id = (select auth.uid())
      and staff.status = 'active'
      and assignment.status = 'active'
      and grant_row.patient_id = requested_patient_id
      and grant_row.status = 'active'
      and grant_row.can_view
      and grant_row.revoked_at is null
      and (grant_row.expires_at is null or grant_row.expires_at > now())
  )
$$;

revoke all on function private.staff_has_patient_access(uuid)
  from public, anon, authenticated;

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
    select membership.clinic_id
    from public.clinic_doctor_memberships membership
    where membership.clinician_id = clinician.id
      and membership.status = 'active'
    order by membership.updated_at desc
    limit 1
  ) sponsored on true
  left join public.clinics clinic on clinic.id = sponsored.clinic_id
  left join lateral (
    select assigned_location.*
    from public.clinic_location_doctor_assignments assignment
    join public.clinic_locations assigned_location
      on assigned_location.id = assignment.clinic_location_id
    where assignment.clinician_id = clinician.id
      and assignment.status = 'active'
      and assigned_location.status = 'active'
    order by assignment.updated_at desc
    limit 1
  ) location on true
  left join lateral (
    select fallback.*
    from public.clinic_locations fallback
    where fallback.clinic_id = sponsored.clinic_id
      and fallback.status = 'active'
    order by fallback.created_at
    limit 1
  ) organization_location on location.id is null
  where clinician.auth_user_id = (select auth.uid())
    and clinician.verification_status = 'approved'
  limit 1
$$;

revoke all on function public.get_my_doctor_workspace()
  from public, anon, authenticated;
grant execute on function public.get_my_doctor_workspace()
  to authenticated;

create or replace function public.update_my_independent_workspace(
  new_clinic_name text,
  new_clinic_country text,
  new_city text,
  new_practice_address text,
  new_latitude numeric,
  new_longitude numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinician_id uuid;
begin
  select clinician.id into clinician_id
  from public.clinicians clinician
  where clinician.auth_user_id = (select auth.uid())
    and clinician.verification_status = 'approved';
  if clinician_id is null then
    raise exception 'Doctor profile is unavailable' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.clinic_doctor_memberships membership
    where membership.clinician_id = clinician_id
      and membership.status = 'active'
  ) then
    raise exception 'Clinic-sponsored Doctors cannot edit clinic details'
      using errcode = '42501';
  end if;
  update public.clinicians set
    clinic_name = btrim(new_clinic_name),
    clinic_country = upper(btrim(new_clinic_country)),
    city = nullif(btrim(new_city), ''),
    practice_address = nullif(btrim(new_practice_address), ''),
    latitude = new_latitude,
    longitude = new_longitude
  where id = clinician_id;
end;
$$;

revoke all on function public.update_my_independent_workspace(
  text, text, text, text, numeric, numeric
) from public, anon, authenticated;
grant execute on function public.update_my_independent_workspace(
  text, text, text, text, numeric, numeric
) to authenticated;

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
    select membership.clinic_id
    from public.clinic_doctor_memberships membership
    where membership.clinician_id = clinician.id
      and membership.status = 'active'
    order by membership.updated_at desc
    limit 1
  ) sponsored on true
  left join public.clinics clinic on clinic.id = sponsored.clinic_id
  left join lateral (
    select assigned_location.*
    from public.clinic_location_doctor_assignments assignment
    join public.clinic_locations assigned_location
      on assigned_location.id = assignment.clinic_location_id
    where assignment.clinician_id = clinician.id
      and assignment.status = 'active'
      and assigned_location.status = 'active'
    order by assignment.updated_at desc
    limit 1
  ) location on true
  left join lateral (
    select fallback.*
    from public.clinic_locations fallback
    where fallback.clinic_id = sponsored.clinic_id
      and fallback.status = 'active'
    order by fallback.created_at
    limit 1
  ) organization_location on location.id is null
  where clinician.verification_status = 'approved'
    and (nullif(btrim(requested_search), '') is null or concat_ws(' ',
      clinician.full_name, clinician.specialty,
      coalesce(location.display_name, organization_location.display_name, clinic.display_name, clinician.clinic_name),
      coalesce(location.city, organization_location.city, clinic.city, clinician.city),
      coalesce(location.address, organization_location.address, clinic.address, clinician.practice_address))
      ilike '%' || btrim(requested_search) || '%')
  order by clinician.full_name
  limit 100
$$;

revoke all on function public.search_public_doctors(text)
  from public, anon, authenticated;
grant execute on function public.search_public_doctors(text)
  to anon, authenticated;

-- Date-free Admin RPC overloads. Older signatures remain only for migration
-- compatibility and are no longer executable by browser roles.
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
  request_correlation_id uuid
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.create_admin_clinic_location(
    requested_clinic_id, new_display_name, new_country_code, new_description,
    new_public_phone, new_public_email, new_city, new_address, new_latitude,
    new_longitude, new_status, null::date, null::date,
    request_correlation_id
  )
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
  status_reason text,
  request_correlation_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.update_admin_clinic_location(
    requested_location_id, new_display_name, new_country_code, new_description,
    new_public_phone, new_public_email, new_city, new_address, new_latitude,
    new_longitude, new_status, null::date, null::date, status_reason,
    request_correlation_id
  )
$$;

create function public.set_admin_doctor_location_assignment(
  requested_location_id uuid,
  requested_clinician_id uuid,
  new_status public.organization_membership_status,
  request_correlation_id uuid
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.set_admin_doctor_location_assignment(
    requested_location_id, requested_clinician_id, new_status,
    null::date, null::date, request_correlation_id
  )
$$;

revoke all on function public.create_admin_clinic_location(
  uuid, text, text, text, text, text, text, text, numeric, numeric,
  public.organization_status, date, date, uuid
) from public, anon, authenticated;
revoke all on function public.update_admin_clinic_location(
  uuid, text, text, text, text, text, text, text, numeric, numeric,
  public.organization_status, date, date, text, uuid
) from public, anon, authenticated;
revoke all on function public.set_admin_doctor_location_assignment(
  uuid, uuid, public.organization_membership_status, date, date, uuid
) from public, anon, authenticated;

revoke all on function public.create_admin_clinic_location(
  uuid, text, text, text, text, text, text, text, numeric, numeric,
  public.organization_status, uuid
) from public, anon, authenticated;
grant execute on function public.create_admin_clinic_location(
  uuid, text, text, text, text, text, text, text, numeric, numeric,
  public.organization_status, uuid
) to authenticated;
revoke all on function public.update_admin_clinic_location(
  uuid, text, text, text, text, text, text, text, numeric, numeric,
  public.organization_status, text, uuid
) from public, anon, authenticated;
grant execute on function public.update_admin_clinic_location(
  uuid, text, text, text, text, text, text, text, numeric, numeric,
  public.organization_status, text, uuid
) to authenticated;
revoke all on function public.set_admin_doctor_location_assignment(
  uuid, uuid, public.organization_membership_status, uuid
) from public, anon, authenticated;
grant execute on function public.set_admin_doctor_location_assignment(
  uuid, uuid, public.organization_membership_status, uuid
) to authenticated;

comment on table public.billing_profiles is
  'Billing and payment state is accounting information only and must never gate platform access.';
comment on table public.staff_doctor_assignments is
  'Current Staff access is controlled only by assignment and Staff lifecycle status; dates are historical metadata.';
comment on table public.clinic_location_doctor_assignments is
  'Current Doctor location access is controlled only by assignment and location lifecycle status; dates are historical metadata.';

commit;
