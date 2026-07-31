begin;

alter table public.clinicians
  add column professional_bio text,
  add column public_phone text,
  add column public_email text,
  add column years_experience smallint,
  add column spoken_languages text[] not null default '{}',
  add column accepts_new_patients boolean not null default true,
  add constraint clinicians_professional_bio_length
    check (professional_bio is null or char_length(professional_bio) <= 2000),
  add constraint clinicians_public_phone_length
    check (public_phone is null or char_length(public_phone) between 5 and 40),
  add constraint clinicians_public_email_length
    check (public_email is null or char_length(public_email) between 3 and 320),
  add constraint clinicians_years_experience_range
    check (years_experience is null or years_experience between 0 and 70),
  add constraint clinicians_spoken_languages_limit
    check (cardinality(spoken_languages) <= 12);

alter table public.clinics
  add column description text,
  add column public_phone text,
  add column public_email text,
  add column city text,
  add column address text,
  add column latitude numeric(9, 6),
  add column longitude numeric(9, 6),
  add constraint clinics_description_length
    check (description is null or char_length(description) <= 2000),
  add constraint clinics_public_phone_length
    check (public_phone is null or char_length(public_phone) between 5 and 40),
  add constraint clinics_public_email_length
    check (public_email is null or char_length(public_email) between 3 and 320),
  add constraint clinics_city_length
    check (city is null or char_length(city) between 2 and 120),
  add constraint clinics_address_length
    check (address is null or char_length(address) between 3 and 240),
  add constraint clinics_latitude_range
    check (latitude is null or latitude between -90 and 90),
  add constraint clinics_longitude_range
    check (longitude is null or longitude between -180 and 180),
  add constraint clinics_location_pair
    check ((latitude is null) = (longitude is null));

alter type public.application_administrator_role add value if not exists 'manager';

alter table public.application_administrators
  add column accounting_access boolean not null default false;

create table public.billing_rates (
  effective_month date primary key,
  subscription_cents integer not null check (subscription_cents between 0 and 1000000),
  sms_unit_cents integer not null check (sms_unit_cents between 0 and 10000),
  updated_at timestamptz not null default now(),
  check (effective_month = date_trunc('month', effective_month)::date)
);

insert into public.billing_rates (effective_month, subscription_cents, sms_unit_cents)
values (date_trunc('month', current_date)::date, 2000, 10);

alter table public.billing_rates enable row level security;
revoke all on table public.billing_rates from public, anon, authenticated;

create function private.has_platform_accounting_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.jwt()->>'aal') = 'aal2'
    and exists (
      select 1
      from public.application_administrators administrator
      where administrator.auth_user_id = (select auth.uid())
        and administrator.status = 'active'
        and (
          administrator.role::text in ('superadmin', 'admin')
          or administrator.accounting_access
        )
    )
$$;

revoke all on function private.has_platform_accounting_access()
  from public, anon, authenticated;
grant execute on function private.has_platform_accounting_access()
  to authenticated;

create function public.get_my_accounting_identity()
returns table (
  id uuid,
  auth_user_id uuid,
  role public.application_administrator_role,
  status public.application_administrator_status,
  display_name text,
  accounting_access boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select administrator.id, administrator.auth_user_id, administrator.role,
    administrator.status, administrator.display_name,
    administrator.accounting_access
  from public.application_administrators administrator
  where administrator.auth_user_id = (select auth.uid())
  limit 1
$$;

revoke all on function public.get_my_accounting_identity()
  from public, anon, authenticated;
grant execute on function public.get_my_accounting_identity()
  to authenticated;

create function public.get_billing_rates()
returns table (effective_month date, subscription_cents integer, sms_unit_cents integer)
language sql
stable
security definer
set search_path = ''
as $$
  select rate.effective_month, rate.subscription_cents, rate.sms_unit_cents
  from public.billing_rates rate
  where private.has_platform_accounting_access()
  order by rate.effective_month desc
  limit 12
$$;

revoke all on function public.get_billing_rates()
  from public, anon, authenticated;
grant execute on function public.get_billing_rates() to authenticated;

create function public.set_administrator_accounting_access(
  requested_administrator_id uuid,
  new_accounting_access boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_superadmin() then
    raise exception 'Superadmin access required' using errcode = '42501';
  end if;
  update public.application_administrators administrator set
    accounting_access = new_accounting_access
  where administrator.id = requested_administrator_id
    and administrator.auth_user_id <> (select auth.uid())
    and administrator.role::text = 'manager';
  if not found then
    raise exception 'Eligible administrator not found' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.set_administrator_accounting_access(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_administrator_accounting_access(uuid, boolean)
  to authenticated;

create function public.set_next_billing_rates(
  new_subscription_cents integer,
  new_sms_unit_cents integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_platform_accounting_access() then
    raise exception 'Accounting access required' using errcode = '42501';
  end if;
  insert into public.billing_rates (
    effective_month, subscription_cents, sms_unit_cents
  ) values (
    (date_trunc('month', current_date) + interval '1 month')::date,
    new_subscription_cents, new_sms_unit_cents
  ) on conflict (effective_month) do update set
    subscription_cents = excluded.subscription_cents,
    sms_unit_cents = excluded.sms_unit_cents,
    updated_at = now();
end;
$$;

revoke all on function public.set_next_billing_rates(integer, integer)
  from public, anon, authenticated;
grant execute on function public.set_next_billing_rates(integer, integer)
  to authenticated;

create function public.get_my_doctor_workspace()
returns table (
  clinician_id uuid,
  full_name text,
  specialty text,
  professional_bio text,
  public_phone text,
  public_email text,
  years_experience smallint,
  spoken_languages text[],
  accepts_new_patients boolean,
  sponsored_clinic_id uuid,
  clinic_name text,
  clinic_country text,
  city text,
  practice_address text,
  latitude numeric,
  longitude numeric,
  is_independent boolean,
  can_edit_workspace boolean,
  can_edit_billing boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select clinician.id, clinician.full_name, clinician.specialty,
    clinician.professional_bio, clinician.public_phone, clinician.public_email,
    clinician.years_experience, clinician.spoken_languages,
    clinician.accepts_new_patients, sponsored.clinic_id,
    coalesce(clinic.display_name, clinician.clinic_name),
    coalesce(clinic.country_code::text, clinician.clinic_country::text),
    coalesce(clinic.city, clinician.city),
    coalesce(clinic.address, clinician.practice_address),
    coalesce(clinic.latitude, clinician.latitude),
    coalesce(clinic.longitude, clinician.longitude),
    sponsored.clinic_id is null, sponsored.clinic_id is null,
    sponsored.clinic_id is null
  from public.clinicians clinician
  left join lateral (
    select period.clinic_id
    from public.clinic_sponsorship_periods period
    join public.clinic_doctor_memberships membership
      on membership.clinic_id = period.clinic_id
      and membership.clinician_id = period.clinician_id
      and membership.status = 'active'
    where period.clinician_id = clinician.id
      and period.effective_from <= current_date
      and (period.effective_until is null or period.effective_until > current_date)
    order by period.effective_from desc
    limit 1
  ) sponsored on true
  left join public.clinics clinic on clinic.id = sponsored.clinic_id
  where clinician.auth_user_id = (select auth.uid())
    and clinician.verification_status = 'approved'
  limit 1
$$;

revoke all on function public.get_my_doctor_workspace()
  from public, anon, authenticated;
grant execute on function public.get_my_doctor_workspace()
  to authenticated;

create function public.update_my_doctor_profile(
  new_professional_bio text,
  new_public_phone text,
  new_public_email text,
  new_years_experience smallint,
  new_spoken_languages text[],
  new_accepts_new_patients boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.clinicians clinician set
    professional_bio = nullif(btrim(new_professional_bio), ''),
    public_phone = nullif(btrim(new_public_phone), ''),
    public_email = nullif(lower(btrim(new_public_email)), ''),
    years_experience = new_years_experience,
    spoken_languages = coalesce(new_spoken_languages, '{}'),
    accepts_new_patients = coalesce(new_accepts_new_patients, true)
  where clinician.auth_user_id = (select auth.uid())
    and clinician.verification_status = 'approved';
  if not found then
    raise exception 'Doctor profile is unavailable' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.update_my_doctor_profile(
  text, text, text, smallint, text[], boolean
) from public, anon, authenticated;
grant execute on function public.update_my_doctor_profile(
  text, text, text, smallint, text[], boolean
) to authenticated;

create function public.update_my_independent_workspace(
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
    select 1 from public.clinic_sponsorship_periods period
    where period.clinician_id = clinician_id
      and period.effective_from <= current_date
      and (period.effective_until is null or period.effective_until > current_date)
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

create function public.create_managed_clinic(
  new_legal_name text,
  new_display_name text,
  new_country_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  manager_id uuid;
  new_clinic_id uuid;
begin
  select manager.id into manager_id
  from public.clinic_manager_profiles manager
  where manager.auth_user_id = (select auth.uid())
    and manager.status = 'active';
  if manager_id is null then
    raise exception 'Clinic Manager access required' using errcode = '42501';
  end if;
  insert into public.clinics (legal_name, display_name, country_code, status)
  values (btrim(new_legal_name), btrim(new_display_name),
    upper(btrim(new_country_code)), 'active')
  returning id into new_clinic_id;
  insert into public.clinic_manager_memberships (
    clinic_id, clinic_manager_id, membership_role, status
  ) values (new_clinic_id, manager_id, 'owner', 'active');
  insert into public.billing_profiles (clinic_id) values (new_clinic_id);
  return new_clinic_id;
end;
$$;

revoke all on function public.create_managed_clinic(text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_managed_clinic(text, text, text)
  to authenticated;

create function public.update_managed_clinic(
  requested_clinic_id uuid,
  new_legal_name text,
  new_display_name text,
  new_country_code text,
  new_description text,
  new_public_phone text,
  new_public_email text,
  new_city text,
  new_address text,
  new_latitude numeric,
  new_longitude numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
    raise exception 'Clinic Manager access required' using errcode = '42501';
  end if;
  update public.clinics set
    legal_name = btrim(new_legal_name),
    display_name = btrim(new_display_name),
    country_code = upper(btrim(new_country_code)),
    description = nullif(btrim(new_description), ''),
    public_phone = nullif(btrim(new_public_phone), ''),
    public_email = nullif(lower(btrim(new_public_email)), ''),
    city = nullif(btrim(new_city), ''),
    address = nullif(btrim(new_address), ''),
    latitude = new_latitude,
    longitude = new_longitude
  where id = requested_clinic_id;
end;
$$;

revoke all on function public.update_managed_clinic(
  uuid, text, text, text, text, text, text, text, text, numeric, numeric
) from public, anon, authenticated;
grant execute on function public.update_managed_clinic(
  uuid, text, text, text, text, text, text, text, text, numeric, numeric
) to authenticated;

revoke all on function public.search_public_doctors(text) from public;
drop function public.search_public_doctors(text);

create function public.search_public_doctors(requested_search text default null)
returns table (
  clinician_id uuid,
  full_name text,
  specialty text,
  clinic_name text,
  clinic_country text,
  city text,
  practice_address text,
  latitude numeric,
  longitude numeric,
  professional_bio text,
  public_phone text,
  public_email text,
  years_experience smallint,
  spoken_languages text[],
  accepts_new_patients boolean,
  is_clinic_sponsored boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select clinician.id, clinician.full_name, clinician.specialty,
    coalesce(clinic.display_name, clinician.clinic_name),
    coalesce(clinic.country_code::text, clinician.clinic_country::text),
    coalesce(clinic.city, clinician.city),
    coalesce(clinic.address, clinician.practice_address),
    coalesce(clinic.latitude, clinician.latitude),
    coalesce(clinic.longitude, clinician.longitude),
    clinician.professional_bio,
    coalesce(clinician.public_phone, clinic.public_phone),
    coalesce(clinician.public_email, clinic.public_email),
    clinician.years_experience, clinician.spoken_languages,
    clinician.accepts_new_patients, sponsored.clinic_id is not null
  from public.clinicians clinician
  left join lateral (
    select period.clinic_id
    from public.clinic_sponsorship_periods period
    join public.clinic_doctor_memberships membership
      on membership.clinic_id = period.clinic_id
      and membership.clinician_id = period.clinician_id
      and membership.status = 'active'
    where period.clinician_id = clinician.id
      and period.effective_from <= current_date
      and (period.effective_until is null or period.effective_until > current_date)
    order by period.effective_from desc limit 1
  ) sponsored on true
  left join public.clinics clinic on clinic.id = sponsored.clinic_id
  where clinician.verification_status = 'approved'
    and (
      nullif(btrim(requested_search), '') is null
      or concat_ws(' ', clinician.full_name, clinician.specialty,
        coalesce(clinic.display_name, clinician.clinic_name),
        coalesce(clinic.city, clinician.city),
        coalesce(clinic.address, clinician.practice_address))
        ilike '%' || btrim(requested_search) || '%'
    )
  order by clinician.full_name
  limit 100
$$;

revoke all on function public.search_public_doctors(text)
  from public;
grant execute on function public.search_public_doctors(text)
  to anon, authenticated;

create function public.get_clinic_billing_usage(
  requested_clinic_id uuid,
  requested_months integer default 6
)
returns table (
  usage_month date,
  statement_status text,
  clinician_id uuid,
  clinician_name text,
  subscription_cents integer,
  sms_count bigint,
  sms_unit_cents integer,
  total_cents bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with authorized as (
    select 1
    from public.clinic_manager_memberships membership
    join public.clinic_manager_profiles manager
      on manager.id = membership.clinic_manager_id
    where membership.clinic_id = requested_clinic_id
      and membership.status = 'active'
      and manager.auth_user_id = (select auth.uid())
      and manager.status = 'active'
  ), months as (
    select generate_series(
      date_trunc('month', current_date) -
        (least(greatest(requested_months, 1), 6) - 1) * interval '1 month',
      date_trunc('month', current_date), interval '1 month'
    )::date as usage_month
  ), sponsored as (
    select months.usage_month, period.clinician_id
    from months
    join public.clinic_sponsorship_periods period
      on period.clinic_id = requested_clinic_id
      and period.effective_from < months.usage_month + interval '1 month'
      and (period.effective_until is null
        or period.effective_until > months.usage_month)
  )
  select sponsored.usage_month,
    case when sponsored.usage_month < date_trunc('month', current_date)::date
      then 'closed' else 'open' end,
    clinician.id, clinician.full_name, rate.subscription_cents,
    count(notification.id) filter (where notification.status = 'sent'),
    rate.sms_unit_cents,
    rate.subscription_cents + rate.sms_unit_cents * (count(notification.id)
      filter (where notification.status = 'sent'))
  from authorized, sponsored
  join public.clinicians clinician on clinician.id = sponsored.clinician_id
  cross join lateral (
    select configured.subscription_cents, configured.sms_unit_cents
    from public.billing_rates configured
    where configured.effective_month <= sponsored.usage_month
    order by configured.effective_month desc limit 1
  ) rate
  left join public.appointments appointment
    on appointment.clinician_id = clinician.id
  left join public.appointment_notifications notification
    on notification.appointment_id = appointment.id
    and notification.sent_at >= sponsored.usage_month
    and notification.sent_at < sponsored.usage_month + interval '1 month'
  group by sponsored.usage_month, clinician.id, clinician.full_name,
    rate.subscription_cents, rate.sms_unit_cents
  order by sponsored.usage_month desc, clinician.full_name
$$;

revoke all on function public.get_clinic_billing_usage(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_clinic_billing_usage(uuid, integer)
  to authenticated;

create function public.get_platform_billing_usage(requested_months integer default 6)
returns table (
  usage_month date,
  payer_kind text,
  payer_id uuid,
  payer_name text,
  doctor_count bigint,
  sms_count bigint,
  total_cents bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with months as (
    select generate_series(
      date_trunc('month', current_date) -
        (least(greatest(requested_months, 1), 6) - 1) * interval '1 month',
      date_trunc('month', current_date), interval '1 month'
    )::date as usage_month
  ), clinic_rows as (
    select months.usage_month, 'clinic'::text payer_kind,
      clinic.id payer_id, clinic.display_name payer_name,
      count(distinct period.clinician_id) doctor_count,
      count(distinct notification.id) filter (where notification.status = 'sent') sms_count
    from months
    join public.clinics clinic on true
    join public.clinic_sponsorship_periods period
      on period.clinic_id = clinic.id
      and period.effective_from < months.usage_month + interval '1 month'
      and (period.effective_until is null or period.effective_until > months.usage_month)
    left join public.appointments appointment
      on appointment.clinician_id = period.clinician_id
    left join public.appointment_notifications notification
      on notification.appointment_id = appointment.id
      and notification.sent_at >= months.usage_month
      and notification.sent_at < months.usage_month + interval '1 month'
    group by months.usage_month, clinic.id, clinic.display_name
  ), independent_rows as (
    select months.usage_month, 'doctor'::text payer_kind,
      clinician.id payer_id, clinician.full_name payer_name,
      1::bigint doctor_count,
      count(distinct notification.id) filter (where notification.status = 'sent') sms_count
    from months
    join public.clinicians clinician on clinician.verification_status = 'approved'
    left join public.appointments appointment on appointment.clinician_id = clinician.id
    left join public.appointment_notifications notification
      on notification.appointment_id = appointment.id
      and notification.sent_at >= months.usage_month
      and notification.sent_at < months.usage_month + interval '1 month'
    where not exists (
      select 1 from public.clinic_sponsorship_periods period
      where period.clinician_id = clinician.id
        and period.effective_from < months.usage_month + interval '1 month'
        and (period.effective_until is null or period.effective_until > months.usage_month)
    )
    group by months.usage_month, clinician.id, clinician.full_name
  )
  select usage.usage_month, usage.payer_kind, usage.payer_id,
    usage.payer_name, usage.doctor_count, usage.sms_count,
    usage.doctor_count * rate.subscription_cents
      + usage.sms_count * rate.sms_unit_cents
  from (select * from clinic_rows union all select * from independent_rows) usage
  cross join lateral (
    select configured.subscription_cents, configured.sms_unit_cents
    from public.billing_rates configured
    where configured.effective_month <= usage.usage_month
    order by configured.effective_month desc limit 1
  ) rate
  where private.has_platform_accounting_access()
  order by usage.usage_month desc, usage.payer_kind, usage.payer_name
$$;

revoke all on function public.get_platform_billing_usage(integer)
  from public, anon, authenticated;
grant execute on function public.get_platform_billing_usage(integer)
  to authenticated;

commit;
