begin;

alter type public.invitation_kind add value if not exists 'platform_doctor';

commit;

begin;

alter table public.organization_invitations
  add column inviting_administrator_id uuid
    references public.application_administrators(id) on delete restrict,
  add column free_access_months smallint
    check (free_access_months is null or free_access_months in (3, 6, 12));

do $$
declare
  shape_constraint text;
begin
  select constraint_name.conname into shape_constraint
  from pg_catalog.pg_constraint constraint_name
  where constraint_name.conrelid = 'public.organization_invitations'::regclass
    and constraint_name.contype = 'c'
    and pg_catalog.pg_get_constraintdef(constraint_name.oid) like '%invitation_kind%'
  limit 1;
  if shape_constraint is not null then
    execute pg_catalog.format(
      'alter table public.organization_invitations drop constraint %I',
      shape_constraint
    );
  end if;
end;
$$;

alter table public.organization_invitations
  add constraint organization_invitations_actor_shape_check check (
    (invitation_kind = 'clinic_doctor'
      and clinic_id is not null and inviting_manager_id is not null
      and inviting_clinician_id is null and inviting_administrator_id is null
      and free_access_months is null)
    or
    (invitation_kind = 'doctor_staff'
      and clinic_id is null and inviting_manager_id is null
      and inviting_clinician_id is not null and inviting_administrator_id is null
      and free_access_months is null)
    or
    (invitation_kind = 'platform_doctor'
      and clinic_id is null and inviting_manager_id is null
      and inviting_clinician_id is null and inviting_administrator_id is not null)
  );

create unique index platform_doctor_one_pending_invitation_idx
  on public.organization_invitations(invited_email)
  where invitation_kind = 'platform_doctor' and status = 'pending';

create table public.doctor_free_access_periods (
  id uuid primary key default gen_random_uuid(),
  clinician_id uuid not null references public.clinicians(id) on delete restrict,
  starts_on date not null,
  ends_before date not null,
  granted_months smallint not null check (granted_months in (3, 6, 12)),
  invitation_id uuid unique
    references public.organization_invitations(id) on delete restrict,
  created_by_administrator_id uuid not null
    references public.application_administrators(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (ends_before > starts_on)
);

create index doctor_free_access_periods_doctor_dates_idx
  on public.doctor_free_access_periods(clinician_id, starts_on, ends_before);

create function private.prevent_overlapping_doctor_free_access()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.doctor_free_access_periods period
    where period.clinician_id = new.clinician_id
      and period.id <> new.id
      and daterange(period.starts_on, period.ends_before, '[)')
        && daterange(new.starts_on, new.ends_before, '[)')
  ) then
    raise exception 'Doctor free-access periods cannot overlap'
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger doctor_free_access_no_overlap
before insert or update on public.doctor_free_access_periods
for each row execute function private.prevent_overlapping_doctor_free_access();

create table public.doctor_status_history (
  id uuid primary key default gen_random_uuid(),
  clinician_id uuid not null references public.clinicians(id) on delete restrict,
  previous_status public.clinician_verification_status,
  new_status public.clinician_verification_status not null,
  reason text check (reason is null or char_length(reason) <= 500),
  changed_by_administrator_id uuid not null
    references public.application_administrators(id) on delete restrict,
  changed_at timestamptz not null default now()
);

create index doctor_status_history_doctor_time_idx
  on public.doctor_status_history(clinician_id, changed_at desc);

alter table public.doctor_free_access_periods enable row level security;
alter table public.doctor_status_history enable row level security;
revoke all on table public.doctor_free_access_periods
  from public, anon, authenticated;
revoke all on table public.doctor_status_history
  from public, anon, authenticated;

create function public.create_platform_doctor_invitation(
  requested_email text,
  requested_free_access_months integer,
  request_correlation_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_administrator_id uuid;
  invitation_id uuid;
  raw_token text := encode(gen_random_bytes(32), 'hex');
  normalized_email text := lower(btrim(requested_email));
  free_months smallint := nullif(requested_free_access_months, 0)::smallint;
begin
  if not private.is_active_platform_admin() then
    raise insufficient_privilege;
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or requested_free_access_months is null
    or requested_free_access_months not in (0, 3, 6, 12) then
    raise exception 'Invalid Doctor invitation'
      using errcode = '23514';
  end if;
  select administrator.id into actor_administrator_id
  from public.application_administrators administrator
  where administrator.auth_user_id = (select auth.uid())
    and administrator.role::text in ('superadmin', 'admin')
    and administrator.status = 'active';

  if exists (
    select 1 from auth.users user_account
    where lower(user_account.email) = normalized_email
  ) then
    raise unique_violation;
  end if;

  update public.organization_invitations invitation set
    status = 'expired'
  where invitation.invitation_kind = 'platform_doctor'
    and invitation.invited_email = normalized_email
    and invitation.status = 'pending'
    and invitation.expires_at <= now();

  insert into public.organization_invitations (
    invitation_kind, inviting_administrator_id, invited_email,
    token_digest, expires_at, free_access_months
  ) values (
    'platform_doctor', actor_administrator_id, normalized_email,
    digest(raw_token, 'sha256'), now() + interval '7 days', free_months
  ) returning id into invitation_id;

  insert into public.audit_events (
    actor_auth_user_id, actor_administrator_id, action, resource_type,
    resource_id, correlation_id, safe_metadata
  ) values (
    auth.uid(), actor_administrator_id, 'organization_invitation_created',
    'organization_invitations', invitation_id, request_correlation_id,
    '{"changed_fields":["invitation_status","free_access_months"]}'::jsonb
  );
  return raw_token;
end;
$$;

create function public.update_admin_doctor(
  requested_clinician_id uuid,
  new_full_name text,
  new_specialty text,
  new_clinic_name text,
  new_clinic_country text,
  new_professional_identifier text,
  new_verification_status public.clinician_verification_status,
  status_reason text,
  request_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.application_administrators%rowtype;
  previous_status public.clinician_verification_status;
  changed_fields text[] := '{}';
begin
  if not private.is_active_platform_admin() then
    raise insufficient_privilege;
  end if;
  if char_length(btrim(new_full_name)) not between 2 and 160
    or char_length(btrim(new_specialty)) not between 2 and 120
    or char_length(btrim(new_clinic_name)) not between 2 and 160
    or upper(btrim(new_clinic_country)) !~ '^[A-Z]{2}$'
    or char_length(btrim(new_professional_identifier)) not between 3 and 80
    or char_length(coalesce(status_reason, '')) > 500 then
    raise exception 'Invalid Doctor details' using errcode = '23514';
  end if;

  select administrator.* into actor
  from public.application_administrators administrator
  where administrator.auth_user_id = (select auth.uid())
    and administrator.role::text in ('superadmin', 'admin')
    and administrator.status = 'active';
  select clinician.verification_status into previous_status
  from public.clinicians clinician
  where clinician.id = requested_clinician_id
  for update;
  if previous_status is null then
    raise exception 'Doctor not found' using errcode = 'P0002';
  end if;

  update public.clinicians clinician set
    full_name = btrim(new_full_name),
    specialty = btrim(new_specialty),
    clinic_name = btrim(new_clinic_name),
    clinic_country = upper(btrim(new_clinic_country)),
    professional_identifier = btrim(new_professional_identifier),
    verification_status = new_verification_status
  where clinician.id = requested_clinician_id;

  if previous_status is distinct from new_verification_status then
    insert into public.doctor_status_history (
      clinician_id, previous_status, new_status, reason,
      changed_by_administrator_id
    ) values (
      requested_clinician_id, previous_status, new_verification_status,
      nullif(btrim(status_reason), ''), actor.id
    );
    changed_fields := array_append(changed_fields, 'verification_status');
  end if;
  changed_fields := changed_fields || array[
    'full_name', 'specialty', 'clinic_name', 'clinic_country',
    'professional_identifier'
  ];

  if actor.role::text = 'admin' then
    insert into public.audit_events (
      actor_auth_user_id, actor_administrator_id, action, resource_type,
      resource_id, correlation_id, safe_metadata
    ) values (
      auth.uid(), actor.id,
      case
        when previous_status <> 'approved' and new_verification_status = 'approved'
          then 'clinician_approved'
        when previous_status <> 'suspended' and new_verification_status = 'suspended'
          then 'clinician_suspended'
        else 'clinician_updated'
      end,
      'clinicians', requested_clinician_id, request_correlation_id,
      jsonb_build_object('changed_fields', to_jsonb(changed_fields))
    );
  end if;
end;
$$;

create or replace function private.handle_public_account_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  registration_type text := new.raw_user_meta_data->>'registration_type';
  normalized_name text := nullif(btrim(new.raw_user_meta_data->>'full_name'), '');
  clinic_manager_id uuid;
  clinic_id uuid;
  clinician_id uuid;
  staff_id uuid;
  numeric_vitapass_id text;
  accepted_invitation_id uuid;
  accepted_invitation_kind public.invitation_kind;
  inviting_administrator_id uuid;
  invited_free_months smallint;
begin
  if registration_type is null then return new; end if;
  if registration_type not in ('patient', 'doctor', 'clinic_manager', 'staff') then
    raise exception 'Unsupported public registration type' using errcode = '23514';
  end if;
  if normalized_name is null or char_length(normalized_name) > 160 then
    raise exception 'A valid full name is required' using errcode = '23514';
  end if;

  if registration_type = 'patient' then
    numeric_vitapass_id := to_char(nextval('public.vitapass_id_sequence'::regclass), 'FM00000000');
    insert into public.patients (auth_user_id, vitapass_id, full_name, date_of_birth, sex)
    values (new.id, 'VP-' || left(numeric_vitapass_id, 4) || '-' || right(numeric_vitapass_id, 4),
      normalized_name, (new.raw_user_meta_data->>'date_of_birth')::date,
      new.raw_user_meta_data->>'sex');
  elsif registration_type = 'doctor' then
    insert into public.clinicians (
      auth_user_id, full_name, specialty, clinic_name, clinic_country,
      professional_identifier, verification_status
    ) values (
      new.id, normalized_name,
      nullif(btrim(new.raw_user_meta_data->>'specialty'), ''),
      nullif(btrim(new.raw_user_meta_data->>'clinic_name'), ''),
      upper(nullif(btrim(new.raw_user_meta_data->>'clinic_country'), '')),
      nullif(btrim(new.raw_user_meta_data->>'professional_identifier'), ''), 'pending'
    ) returning id into clinician_id;
    insert into public.billing_profiles (clinician_id) values (clinician_id);

    if nullif(new.raw_user_meta_data->>'invitation_token', '') is not null then
      update public.organization_invitations invitation set status = 'accepted', accepted_at = now()
      where invitation.invitation_kind in ('clinic_doctor', 'platform_doctor')
        and invitation.status = 'pending' and invitation.expires_at > now()
        and invitation.invited_email = lower(new.email)
        and invitation.token_digest = pg_catalog.sha256(pg_catalog.convert_to(
          new.raw_user_meta_data->>'invitation_token', 'UTF8'))
      returning invitation.id, invitation.invitation_kind, invitation.clinic_id,
        invitation.inviting_manager_id, invitation.inviting_administrator_id,
        invitation.free_access_months
      into accepted_invitation_id, accepted_invitation_kind, clinic_id,
        clinic_manager_id, inviting_administrator_id, invited_free_months;
      if accepted_invitation_id is null then
        raise exception 'The doctor invitation is invalid or expired' using errcode = '23514';
      end if;
      if accepted_invitation_kind = 'clinic_doctor' then
        insert into public.clinic_doctor_memberships (
          clinic_id, clinician_id, status, starts_on, invited_by_manager_id
        ) values (clinic_id, clinician_id, 'active', current_date, clinic_manager_id);
        insert into public.clinic_sponsorship_periods (
          clinic_id, clinician_id, effective_from, created_by_manager_id
        ) values (clinic_id, clinician_id, current_date, clinic_manager_id);
      elsif invited_free_months is not null then
        insert into public.doctor_free_access_periods (
          clinician_id, starts_on, ends_before, granted_months,
          invitation_id, created_by_administrator_id
        ) values (
          clinician_id, current_date,
          (current_date + make_interval(months => invited_free_months))::date,
          invited_free_months, accepted_invitation_id, inviting_administrator_id
        );
      end if;
    end if;
  elsif registration_type = 'staff' then
    update public.organization_invitations invitation set status = 'accepted', accepted_at = now()
    where invitation.invitation_kind = 'doctor_staff' and invitation.status = 'pending'
      and invitation.expires_at > now() and invitation.invited_email = lower(new.email)
      and invitation.token_digest = pg_catalog.sha256(pg_catalog.convert_to(
        new.raw_user_meta_data->>'invitation_token', 'UTF8'))
    returning invitation.inviting_clinician_id into clinician_id;
    if clinician_id is null then
      raise exception 'The staff invitation is invalid or expired' using errcode = '23514';
    end if;
    insert into public.staff_profiles (auth_user_id, display_name, status, invited_by_clinician_id)
    values (new.id, normalized_name, 'active', clinician_id) returning id into staff_id;
    insert into public.staff_doctor_assignments (staff_id, clinician_id, status, starts_on)
    values (staff_id, clinician_id, 'active', current_date);
  else
    insert into public.clinic_manager_profiles (auth_user_id, display_name, status)
    values (new.id, normalized_name, 'pending') returning id into clinic_manager_id;
    insert into public.clinics (legal_name, display_name, country_code, status)
    values (nullif(btrim(new.raw_user_meta_data->>'clinic_legal_name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'clinic_display_name'), ''),
      upper(nullif(btrim(new.raw_user_meta_data->>'clinic_country'), '')), 'pending')
    returning id into clinic_id;
    insert into public.clinic_manager_memberships (
      clinic_id, clinic_manager_id, membership_role, status
    ) values (clinic_id, clinic_manager_id, 'owner', 'active');
    insert into public.billing_profiles (clinic_id) values (clinic_id);
  end if;
  return new;
end;
$$;

create or replace function public.get_admin_operations_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare snapshot jsonb;
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'generated_at', now(),
    'counts', jsonb_build_object(
      'attention',
        (select count(*) from public.clinicians where verification_status = 'pending')
        + (select count(*) from public.clinics where status = 'pending')
        + (select count(*) from public.clinic_manager_profiles where status = 'pending')
        + (select count(*) from public.billing_profiles where status = 'incomplete'),
      'doctors', (select count(*) from public.clinicians),
      'patients', (select count(*) from public.patients),
      'clinics', (select count(*) from public.clinics),
      'clinic_managers', (select count(*) from public.clinic_manager_profiles),
      'platform_managers', (select count(*) from public.application_administrators where role::text = 'manager')
    ),
    'tasks', coalesce((select jsonb_agg(task order by task->>'created_at') from (
      select jsonb_build_object('id', clinician.id, 'kind', 'doctor_approval',
        'title', clinician.full_name, 'detail', clinician.specialty,
        'status', clinician.verification_status, 'priority', 'high',
        'created_at', clinician.created_at, 'href', '/admin/doctors') task
      from public.clinicians clinician where clinician.verification_status = 'pending'
      union all
      select jsonb_build_object('id', clinic.id, 'kind', 'clinic_approval',
        'title', clinic.display_name, 'detail', clinic.legal_name,
        'status', clinic.status, 'priority', 'high',
        'created_at', clinic.created_at, 'href', '/admin/clinics')
      from public.clinics clinic where clinic.status = 'pending'
      union all
      select jsonb_build_object('id', manager.id, 'kind', 'clinic_manager_approval',
        'title', manager.display_name, 'detail', 'Clinic Manager',
        'status', manager.status, 'priority', 'high',
        'created_at', manager.created_at, 'href', '/admin/organizations')
      from public.clinic_manager_profiles manager where manager.status = 'pending'
      union all
      select jsonb_build_object('id', billing.id, 'kind', 'billing_profile',
        'title', coalesce(clinic.display_name, clinician.full_name, 'Billing profile'),
        'detail', case when billing.clinic_id is not null then 'Clinic billing details' else 'Doctor billing details' end,
        'status', billing.status, 'priority', 'normal',
        'created_at', billing.created_at, 'href', '/admin/invoicing')
      from public.billing_profiles billing
      left join public.clinics clinic on clinic.id = billing.clinic_id
      left join public.clinicians clinician on clinician.id = billing.clinician_id
      where billing.status = 'incomplete'
    ) attention_tasks), '[]'::jsonb),
    'administrators', coalesce((select jsonb_agg(jsonb_build_object(
      'id', administrator.id, 'display_name', administrator.display_name,
      'role', administrator.role, 'status', administrator.status,
      'accounting_access', administrator.accounting_access,
      'created_at', administrator.created_at) order by administrator.created_at desc)
      from public.application_administrators administrator), '[]'::jsonb),
    'doctors', coalesce((select jsonb_agg(jsonb_build_object(
      'id', clinician.id, 'email', user_account.email,
      'full_name', clinician.full_name, 'specialty', clinician.specialty,
      'clinic_name', clinician.clinic_name, 'clinic_country', clinician.clinic_country,
      'verification_status', clinician.verification_status,
      'professional_identifier', clinician.professional_identifier,
      'payer_name', coalesce(payer.display_name, 'Independent Doctor'),
      'payer_kind', case when payer.id is null then 'doctor' else 'clinic' end,
      'clinics', coalesce((select jsonb_agg(jsonb_build_object(
        'id', clinic.id, 'name', clinic.display_name, 'status', membership.status))
        from public.clinic_doctor_memberships membership
        join public.clinics clinic on clinic.id = membership.clinic_id
        where membership.clinician_id = clinician.id), '[]'::jsonb),
      'free_access', coalesce((select jsonb_agg(jsonb_build_object(
        'starts_on', free_period.starts_on, 'ends_before', free_period.ends_before,
        'months', free_period.granted_months) order by free_period.starts_on desc)
        from public.doctor_free_access_periods free_period
        where free_period.clinician_id = clinician.id), '[]'::jsonb),
      'status_history', coalesce((select jsonb_agg(jsonb_build_object(
        'previous_status', history.previous_status, 'new_status', history.new_status,
        'reason', history.reason, 'changed_at', history.changed_at)
        order by history.changed_at desc)
        from public.doctor_status_history history
        where history.clinician_id = clinician.id), '[]'::jsonb),
      'created_at', clinician.created_at) order by clinician.created_at desc)
      from public.clinicians clinician
      left join auth.users user_account on user_account.id = clinician.auth_user_id
      left join lateral (
        select clinic.id, clinic.display_name
        from public.clinic_sponsorship_periods sponsorship
        join public.clinics clinic on clinic.id = sponsorship.clinic_id
        where sponsorship.clinician_id = clinician.id
          and sponsorship.effective_from <= current_date
          and (sponsorship.effective_until is null or sponsorship.effective_until >= current_date)
        order by sponsorship.effective_from desc limit 1
      ) payer on true), '[]'::jsonb),
    'doctor_invitations', coalesce((select jsonb_agg(jsonb_build_object(
      'id', invitation.id, 'email', invitation.invited_email,
      'status', invitation.status, 'free_access_months', invitation.free_access_months,
      'expires_at', invitation.expires_at, 'created_at', invitation.created_at)
      order by invitation.created_at desc)
      from public.organization_invitations invitation
      where invitation.invitation_kind = 'platform_doctor'), '[]'::jsonb),
    'patients', coalesce((select jsonb_agg(jsonb_build_object(
      'id', patient.id, 'vitapass_id', patient.vitapass_id,
      'full_name', patient.full_name, 'archived', patient.archived_at is not null,
      'created_at', patient.created_at) order by patient.created_at desc)
      from public.patients patient), '[]'::jsonb),
    'clinics', coalesce((select jsonb_agg(jsonb_build_object(
      'id', clinic.id, 'display_name', clinic.display_name, 'legal_name', clinic.legal_name,
      'country_code', clinic.country_code, 'status', clinic.status,
      'city', clinic.city, 'address', clinic.address,
      'manager_count', (select count(*) from public.clinic_manager_memberships membership where membership.clinic_id = clinic.id and membership.status = 'active'),
      'doctor_count', (select count(*) from public.clinic_doctor_memberships membership where membership.clinic_id = clinic.id and membership.status = 'active'),
      'created_at', clinic.created_at) order by clinic.created_at desc)
      from public.clinics clinic), '[]'::jsonb),
    'clinic_managers', coalesce((select jsonb_agg(jsonb_build_object(
      'id', manager.id, 'display_name', manager.display_name, 'status', manager.status,
      'clinic_count', (select count(*) from public.clinic_manager_memberships membership where membership.clinic_manager_id = manager.id and membership.status = 'active'),
      'created_at', manager.created_at) order by manager.created_at desc)
      from public.clinic_manager_profiles manager), '[]'::jsonb)
  ) into snapshot;
  return snapshot;
end;
$$;

create or replace function public.get_clinic_billing_usage(
  requested_clinic_id uuid, requested_months integer default 6
)
returns table (
  usage_month date, statement_status text, clinician_id uuid,
  clinician_name text, subscription_cents integer, sms_count bigint,
  sms_unit_cents integer, total_cents bigint
)
language sql stable security definer set search_path = ''
as $$
  with authorized as (
    select 1 from public.clinic_manager_memberships membership
    join public.clinic_manager_profiles manager on manager.id = membership.clinic_manager_id
    where membership.clinic_id = requested_clinic_id and membership.status = 'active'
      and manager.auth_user_id = (select auth.uid()) and manager.status = 'active'
  ), months as (
    select generate_series(date_trunc('month', current_date) -
      (least(greatest(requested_months, 1), 6) - 1) * interval '1 month',
      date_trunc('month', current_date), interval '1 month')::date usage_month
  ), sponsored as (
    select months.usage_month, period.clinician_id from months
    join public.clinic_sponsorship_periods period on period.clinic_id = requested_clinic_id
      and period.effective_from < months.usage_month + interval '1 month'
      and (period.effective_until is null or period.effective_until > months.usage_month)
  )
  select sponsored.usage_month,
    case when sponsored.usage_month < date_trunc('month', current_date)::date then 'closed' else 'open' end,
    clinician.id, clinician.full_name,
    case when free_period.covered then 0 else rate.subscription_cents end,
    count(notification.id) filter (where notification.status = 'sent'), rate.sms_unit_cents,
    (case when free_period.covered then 0 else rate.subscription_cents end)
      + rate.sms_unit_cents * count(notification.id) filter (where notification.status = 'sent')
  from authorized, sponsored
  join public.clinicians clinician on clinician.id = sponsored.clinician_id
  cross join lateral (select configured.subscription_cents, configured.sms_unit_cents
    from public.billing_rates configured where configured.effective_month <= sponsored.usage_month
    order by configured.effective_month desc limit 1) rate
  cross join lateral (select exists (select 1 from public.doctor_free_access_periods period
    where period.clinician_id = clinician.id
      and period.starts_on < sponsored.usage_month + interval '1 month'
      and period.ends_before > sponsored.usage_month) covered) free_period
  left join public.appointments appointment on appointment.clinician_id = clinician.id
  left join public.appointment_notifications notification on notification.appointment_id = appointment.id
    and notification.sent_at >= sponsored.usage_month
    and notification.sent_at < sponsored.usage_month + interval '1 month'
  group by sponsored.usage_month, clinician.id, clinician.full_name,
    rate.subscription_cents, rate.sms_unit_cents, free_period.covered
  order by sponsored.usage_month desc, clinician.full_name
$$;

create or replace function public.get_platform_billing_usage(requested_months integer default 6)
returns table (
  usage_month date, payer_kind text, payer_id uuid, payer_name text,
  doctor_count bigint, sms_count bigint, total_cents bigint
)
language sql stable security definer set search_path = ''
as $$
  with months as (
    select generate_series(date_trunc('month', current_date) -
      (least(greatest(requested_months, 1), 6) - 1) * interval '1 month',
      date_trunc('month', current_date), interval '1 month')::date usage_month
  ), clinic_rows as (
    select months.usage_month, 'clinic'::text payer_kind, clinic.id payer_id,
      clinic.display_name payer_name, count(distinct sponsorship.clinician_id) doctor_count,
      count(distinct sponsorship.clinician_id) filter (where not exists (
        select 1 from public.doctor_free_access_periods free_period
        where free_period.clinician_id = sponsorship.clinician_id
          and free_period.starts_on < months.usage_month + interval '1 month'
          and free_period.ends_before > months.usage_month)) chargeable_doctor_count,
      count(distinct notification.id) filter (where notification.status = 'sent') sms_count
    from months join public.clinics clinic on true
    join public.clinic_sponsorship_periods sponsorship on sponsorship.clinic_id = clinic.id
      and sponsorship.effective_from < months.usage_month + interval '1 month'
      and (sponsorship.effective_until is null or sponsorship.effective_until > months.usage_month)
    left join public.appointments appointment on appointment.clinician_id = sponsorship.clinician_id
    left join public.appointment_notifications notification on notification.appointment_id = appointment.id
      and notification.sent_at >= months.usage_month
      and notification.sent_at < months.usage_month + interval '1 month'
    group by months.usage_month, clinic.id, clinic.display_name
  ), independent_rows as (
    select months.usage_month, 'doctor'::text payer_kind, clinician.id payer_id,
      clinician.full_name payer_name, 1::bigint doctor_count,
      case when exists (select 1 from public.doctor_free_access_periods free_period
        where free_period.clinician_id = clinician.id
          and free_period.starts_on < months.usage_month + interval '1 month'
          and free_period.ends_before > months.usage_month) then 0::bigint else 1::bigint end chargeable_doctor_count,
      count(distinct notification.id) filter (where notification.status = 'sent') sms_count
    from months join public.clinicians clinician on clinician.verification_status = 'approved'
    left join public.appointments appointment on appointment.clinician_id = clinician.id
    left join public.appointment_notifications notification on notification.appointment_id = appointment.id
      and notification.sent_at >= months.usage_month
      and notification.sent_at < months.usage_month + interval '1 month'
    where not exists (select 1 from public.clinic_sponsorship_periods sponsorship
      where sponsorship.clinician_id = clinician.id
        and sponsorship.effective_from < months.usage_month + interval '1 month'
        and (sponsorship.effective_until is null or sponsorship.effective_until > months.usage_month))
    group by months.usage_month, clinician.id, clinician.full_name
  )
  select usage.usage_month, usage.payer_kind, usage.payer_id, usage.payer_name,
    usage.doctor_count, usage.sms_count,
    usage.chargeable_doctor_count * rate.subscription_cents
      + usage.sms_count * rate.sms_unit_cents
  from (select * from clinic_rows union all select * from independent_rows) usage
  cross join lateral (select configured.subscription_cents, configured.sms_unit_cents
    from public.billing_rates configured where configured.effective_month <= usage.usage_month
    order by configured.effective_month desc limit 1) rate
  where private.has_platform_accounting_access()
  order by usage.usage_month desc, usage.payer_kind, usage.payer_name
$$;

revoke all on function private.prevent_overlapping_doctor_free_access()
  from public, anon, authenticated;
revoke all on function public.create_platform_doctor_invitation(text, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.create_platform_doctor_invitation(text, integer, uuid)
  to authenticated;
revoke all on function public.update_admin_doctor(
  uuid, text, text, text, text, text,
  public.clinician_verification_status, text, uuid
) from public, anon, authenticated;
grant execute on function public.update_admin_doctor(
  uuid, text, text, text, text, text,
  public.clinician_verification_status, text, uuid
) to authenticated;

comment on table public.doctor_free_access_periods is
  'Dated subscription-only waivers. SMS usage remains billable and records are never deleted.';
comment on function public.update_admin_doctor(
  uuid, text, text, text, text, text,
  public.clinician_verification_status, text, uuid
) is 'Audited Doctor administration without hard deletion or medical-record access.';

commit;
