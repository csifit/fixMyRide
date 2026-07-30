begin;

create type public.vitapass_account_type as enum (
  'patient',
  'doctor',
  'clinic_manager',
  'staff',
  'platform_manager',
  'platform_admin',
  'superadmin'
);
create type public.organization_status as enum
  ('pending', 'active', 'suspended', 'rejected');
create type public.organization_membership_status as enum
  ('invited', 'active', 'suspended', 'ended');
create type public.clinic_manager_membership_role as enum
  ('owner', 'manager');
create type public.invitation_kind as enum
  ('clinic_doctor', 'doctor_staff');
create type public.invitation_status as enum
  ('pending', 'accepted', 'revoked', 'expired');
create type public.billing_profile_status as enum
  ('incomplete', 'active', 'suspended');

create table public.account_identities (
  auth_user_id uuid primary key references auth.users(id) on delete restrict,
  account_type public.vitapass_account_type not null,
  assigned_at timestamptz not null default now(),
  assigned_by_administrator_id uuid
    references public.application_administrators(id) on delete restrict
);

do $$
declare
  mixed_auth_user uuid;
begin
  select assignment.auth_user_id
  into mixed_auth_user
  from (
    select patient.auth_user_id, 'patient'::text as account_type
    from public.patients patient where patient.auth_user_id is not null
    union all
    select clinician.auth_user_id, 'doctor'
    from public.clinicians clinician where clinician.auth_user_id is not null
    union all
    select administrator.auth_user_id,
      case administrator.role
        when 'superadmin' then 'superadmin'
        else 'platform_admin'
      end
    from public.application_administrators administrator
  ) assignment
  group by assignment.auth_user_id
  having count(distinct assignment.account_type) > 1
  limit 1;

  if mixed_auth_user is not null then
    raise exception
      'Existing Auth user % is linked to multiple VitaPass account types',
      mixed_auth_user
      using errcode = '23514';
  end if;

  insert into public.account_identities (auth_user_id, account_type)
  select assignment.auth_user_id,
    assignment.account_type::public.vitapass_account_type
  from (
    select patient.auth_user_id, 'patient'::text as account_type
    from public.patients patient where patient.auth_user_id is not null
    union all
    select clinician.auth_user_id, 'doctor'
    from public.clinicians clinician where clinician.auth_user_id is not null
    union all
    select administrator.auth_user_id,
      case administrator.role
        when 'superadmin' then 'superadmin'
        else 'platform_admin'
      end
    from public.application_administrators administrator
  ) assignment
  on conflict (auth_user_id) do nothing;
end;
$$;

create function private.enforce_immutable_account_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_type public.vitapass_account_type;
  existing_type public.vitapass_account_type;
begin
  if tg_argv[0] = 'administrator' then
    expected_type := case new.role::text
      when 'superadmin' then 'superadmin'::public.vitapass_account_type
      else 'platform_admin'::public.vitapass_account_type
    end;
  else
    expected_type := tg_argv[0]::public.vitapass_account_type;
  end if;
  if tg_op = 'UPDATE'
    and old.auth_user_id is not null
    and new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'An Auth identity link cannot be changed'
      using errcode = '23514';
  end if;
  if new.auth_user_id is null then
    return new;
  end if;

  insert into public.account_identities (auth_user_id, account_type)
  values (new.auth_user_id, expected_type)
  on conflict (auth_user_id) do nothing;

  select identity.account_type into existing_type
  from public.account_identities identity
  where identity.auth_user_id = new.auth_user_id;
  if existing_type is distinct from expected_type then
    raise exception 'This Auth account already has another VitaPass account type'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_immutable_account_type()
  from public, anon, authenticated;

create trigger patients_enforce_account_type
before insert or update of auth_user_id on public.patients
for each row execute function private.enforce_immutable_account_type('patient');
create trigger clinicians_enforce_account_type
before insert or update of auth_user_id on public.clinicians
for each row execute function private.enforce_immutable_account_type('doctor');
create trigger administrators_enforce_account_type
before insert or update of auth_user_id, role
on public.application_administrators
for each row execute function private.enforce_immutable_account_type('administrator');

create table public.clinic_manager_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  display_name text not null check (char_length(display_name) between 2 and 160),
  status public.organization_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clinic_managers_enforce_account_type
before insert or update of auth_user_id on public.clinic_manager_profiles
for each row execute function
  private.enforce_immutable_account_type('clinic_manager');
create trigger clinic_manager_profiles_updated_at
before update on public.clinic_manager_profiles
for each row execute function public.set_updated_at();

create table public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  display_name text not null check (char_length(display_name) between 2 and 160),
  status public.organization_membership_status not null default 'invited',
  invited_by_clinician_id uuid not null
    references public.clinicians(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger staff_enforce_account_type
before insert or update of auth_user_id on public.staff_profiles
for each row execute function private.enforce_immutable_account_type('staff');
create trigger staff_profiles_updated_at
before update on public.staff_profiles
for each row execute function public.set_updated_at();

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (char_length(legal_name) between 2 and 200),
  display_name text not null check (char_length(display_name) between 2 and 160),
  country_code char(2) not null default 'RO'
    check (country_code = upper(country_code)),
  status public.organization_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clinics_updated_at before update on public.clinics
for each row execute function public.set_updated_at();

create table public.clinic_manager_memberships (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  clinic_manager_id uuid not null
    references public.clinic_manager_profiles(id) on delete restrict,
  membership_role public.clinic_manager_membership_role not null,
  status public.organization_membership_status not null default 'active',
  starts_on date not null default current_date,
  ends_before date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_before is null or ends_before > starts_on)
);

create unique index clinic_manager_one_live_membership_idx
  on public.clinic_manager_memberships(clinic_id, clinic_manager_id)
  where status in ('invited', 'active', 'suspended');
create trigger clinic_manager_memberships_updated_at
before update on public.clinic_manager_memberships
for each row execute function public.set_updated_at();

create table public.clinic_doctor_memberships (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  clinician_id uuid not null references public.clinicians(id) on delete restrict,
  status public.organization_membership_status not null default 'invited',
  starts_on date,
  ends_before date,
  invited_by_manager_id uuid not null
    references public.clinic_manager_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_before is null or starts_on is null or ends_before > starts_on),
  check (status <> 'active' or starts_on is not null)
);

create unique index clinic_doctor_one_live_membership_idx
  on public.clinic_doctor_memberships(clinic_id, clinician_id)
  where status in ('invited', 'active', 'suspended');
create trigger clinic_doctor_memberships_updated_at
before update on public.clinic_doctor_memberships
for each row execute function public.set_updated_at();

create table public.clinic_sponsorship_periods (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  clinician_id uuid not null references public.clinicians(id) on delete restrict,
  effective_from date not null,
  effective_until date,
  created_by_manager_id uuid not null
    references public.clinic_manager_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (effective_until is null or effective_until >= effective_from)
);

create function private.prevent_overlapping_clinic_sponsorships()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.clinic_sponsorship_periods period
    where period.clinician_id = new.clinician_id
      and period.id <> new.id
      and daterange(
        period.effective_from,
        coalesce(period.effective_until, 'infinity'::date),
        '[)'
      ) && daterange(
        new.effective_from,
        coalesce(new.effective_until, 'infinity'::date),
        '[)'
      )
  ) then
    raise exception 'Doctor sponsorship periods cannot overlap'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_overlapping_clinic_sponsorships()
  from public, anon, authenticated;
create trigger clinic_sponsorships_no_overlap
before insert or update on public.clinic_sponsorship_periods
for each row execute function private.prevent_overlapping_clinic_sponsorships();

create table public.staff_doctor_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles(id) on delete restrict,
  clinician_id uuid not null references public.clinicians(id) on delete restrict,
  status public.organization_membership_status not null default 'invited',
  starts_on date,
  ends_before date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_before is null or starts_on is null or ends_before > starts_on),
  check (status <> 'active' or starts_on is not null)
);

create unique index staff_doctor_one_live_assignment_idx
  on public.staff_doctor_assignments(staff_id, clinician_id)
  where status in ('invited', 'active', 'suspended');
create trigger staff_doctor_assignments_updated_at
before update on public.staff_doctor_assignments
for each row execute function public.set_updated_at();

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  invitation_kind public.invitation_kind not null,
  clinic_id uuid references public.clinics(id) on delete restrict,
  inviting_manager_id uuid
    references public.clinic_manager_profiles(id) on delete restrict,
  inviting_clinician_id uuid references public.clinicians(id) on delete restrict,
  invited_email text not null check (
    char_length(invited_email) between 3 and 320
    and invited_email = lower(invited_email)
  ),
  token_digest bytea not null unique,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (invitation_kind = 'clinic_doctor'
      and clinic_id is not null and inviting_manager_id is not null
      and inviting_clinician_id is null)
    or
    (invitation_kind = 'doctor_staff'
      and clinic_id is null and inviting_manager_id is null
      and inviting_clinician_id is not null)
  ),
  check (expires_at > created_at),
  check (status <> 'accepted' or accepted_at is not null),
  check (status <> 'revoked' or revoked_at is not null)
);

create unique index clinic_doctor_one_pending_invitation_idx
  on public.organization_invitations(clinic_id, invited_email)
  where invitation_kind = 'clinic_doctor' and status = 'pending';
create unique index doctor_staff_one_pending_invitation_idx
  on public.organization_invitations(inviting_clinician_id, invited_email)
  where invitation_kind = 'doctor_staff' and status = 'pending';

create table public.billing_profiles (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete restrict,
  clinician_id uuid references public.clinicians(id) on delete restrict,
  status public.billing_profile_status not null default 'incomplete',
  legal_name text check (legal_name is null or char_length(legal_name) between 2 and 200),
  fiscal_identifier text check (
    fiscal_identifier is null or char_length(fiscal_identifier) between 2 and 40
  ),
  vat_identifier text check (
    vat_identifier is null or char_length(vat_identifier) between 2 and 40
  ),
  trade_register_number text check (
    trade_register_number is null
    or char_length(trade_register_number) between 2 and 60
  ),
  billing_address text check (
    billing_address is null or char_length(billing_address) between 5 and 500
  ),
  billing_country char(2) check (
    billing_country is null or billing_country = upper(billing_country)
  ),
  billing_email text check (
    billing_email is null or char_length(billing_email) between 3 and 320
  ),
  billing_contact text check (
    billing_contact is null or char_length(billing_contact) between 2 and 160
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((clinic_id is not null)::integer + (clinician_id is not null)::integer = 1)
);

create unique index billing_profiles_clinic_idx
  on public.billing_profiles(clinic_id) where clinic_id is not null;
create unique index billing_profiles_clinician_idx
  on public.billing_profiles(clinician_id) where clinician_id is not null;
create trigger billing_profiles_updated_at before update on public.billing_profiles
for each row execute function public.set_updated_at();

create sequence public.vitapass_id_sequence
  as bigint start with 50000000 minvalue 50000000 maxvalue 99999999;
revoke all on sequence public.vitapass_id_sequence
  from public, anon, authenticated;

create function private.handle_public_account_registration()
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
begin
  if registration_type is null then
    return new;
  end if;
  if registration_type not in (
    'patient', 'doctor', 'clinic_manager', 'staff'
  ) then
    raise exception 'Unsupported public registration type'
      using errcode = '23514';
  end if;
  if normalized_name is null or char_length(normalized_name) > 160 then
    raise exception 'A valid full name is required'
      using errcode = '23514';
  end if;

  if registration_type = 'patient' then
    numeric_vitapass_id := to_char(
      nextval('public.vitapass_id_sequence'::regclass),
      'FM00000000'
    );
    insert into public.patients (
      auth_user_id, vitapass_id, full_name, date_of_birth, sex
    ) values (
      new.id,
      'VP-' || left(numeric_vitapass_id, 4) || '-'
        || right(numeric_vitapass_id, 4),
      normalized_name,
      (new.raw_user_meta_data->>'date_of_birth')::date,
      new.raw_user_meta_data->>'sex'
    );
  elsif registration_type = 'doctor' then
    insert into public.clinicians (
      auth_user_id, full_name, specialty, clinic_name, clinic_country,
      professional_identifier, verification_status
    ) values (
      new.id,
      normalized_name,
      nullif(btrim(new.raw_user_meta_data->>'specialty'), ''),
      nullif(btrim(new.raw_user_meta_data->>'clinic_name'), ''),
      upper(nullif(btrim(new.raw_user_meta_data->>'clinic_country'), '')),
      nullif(btrim(new.raw_user_meta_data->>'professional_identifier'), ''),
      'pending'
    )
    returning id into clinician_id;
    insert into public.billing_profiles (clinician_id)
    values (clinician_id);
    if nullif(new.raw_user_meta_data->>'invitation_token', '') is not null then
      update public.organization_invitations invitation set
        status = 'accepted', accepted_at = now()
      where invitation.invitation_kind = 'clinic_doctor'
        and invitation.status = 'pending'
        and invitation.expires_at > now()
        and invitation.invited_email = lower(new.email)
        and invitation.token_digest = digest(
          new.raw_user_meta_data->>'invitation_token',
          'sha256'
        )
      returning invitation.clinic_id, invitation.inviting_manager_id
      into clinic_id, clinic_manager_id;
      if clinic_id is null then
        raise exception 'The doctor invitation is invalid or expired'
          using errcode = '23514';
      end if;
      insert into public.clinic_doctor_memberships (
        clinic_id, clinician_id, status, starts_on, invited_by_manager_id
      ) values (
        clinic_id, clinician_id, 'active', current_date, clinic_manager_id
      );
      insert into public.clinic_sponsorship_periods (
        clinic_id, clinician_id, effective_from, created_by_manager_id
      ) values (
        clinic_id, clinician_id, current_date, clinic_manager_id
      );
    end if;
  elsif registration_type = 'staff' then
    update public.organization_invitations invitation set
      status = 'accepted', accepted_at = now()
    where invitation.invitation_kind = 'doctor_staff'
      and invitation.status = 'pending'
      and invitation.expires_at > now()
      and invitation.invited_email = lower(new.email)
      and invitation.token_digest = digest(
        new.raw_user_meta_data->>'invitation_token',
        'sha256'
      )
    returning invitation.inviting_clinician_id into clinician_id;
    if clinician_id is null then
      raise exception 'The staff invitation is invalid or expired'
        using errcode = '23514';
    end if;
    insert into public.staff_profiles (
      auth_user_id, display_name, status, invited_by_clinician_id
    ) values (new.id, normalized_name, 'active', clinician_id)
    returning id into staff_id;
    insert into public.staff_doctor_assignments (
      staff_id, clinician_id, status, starts_on
    ) values (staff_id, clinician_id, 'active', current_date);
  else
    insert into public.clinic_manager_profiles (
      auth_user_id, display_name, status
    ) values (new.id, normalized_name, 'pending')
    returning id into clinic_manager_id;
    insert into public.clinics (
      legal_name, display_name, country_code, status
    ) values (
      nullif(btrim(new.raw_user_meta_data->>'clinic_legal_name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'clinic_display_name'), ''),
      upper(nullif(btrim(new.raw_user_meta_data->>'clinic_country'), '')),
      'pending'
    )
    returning id into clinic_id;
    insert into public.clinic_manager_memberships (
      clinic_id, clinic_manager_id, membership_role, status
    ) values (clinic_id, clinic_manager_id, 'owner', 'active');
    insert into public.billing_profiles (clinic_id)
    values (clinic_id);
  end if;
  return new;
end;
$$;

revoke all on function private.handle_public_account_registration()
  from public, anon, authenticated;
create trigger vitapass_public_account_registration
after insert on auth.users
for each row execute function private.handle_public_account_registration();

alter table public.audit_events
  add column actor_clinic_manager_id uuid
    references public.clinic_manager_profiles(id) on delete restrict,
  add column actor_staff_id uuid
    references public.staff_profiles(id) on delete restrict;

alter table public.audit_events drop constraint audit_events_action_check;
alter table public.audit_events add constraint audit_events_action_check
check (action in (
  'sign_in', 'sign_out', 'access_denied', 'patient_profile_viewed',
  'patient_profile_updated', 'access_grant_created',
  'access_grant_approved', 'access_grant_revoked',
  'access_grant_updated', 'administrator_created',
  'administrator_updated', 'administrator_suspended',
  'clinician_created', 'clinician_updated', 'clinician_approved',
  'clinician_suspended', 'patient_created', 'patient_updated',
  'patient_archived', 'medical_record_created', 'medical_record_updated',
  'sensitive_identifiers_viewed', 'sensitive_identifiers_updated',
  'clinic_created', 'clinic_updated', 'clinic_membership_updated',
  'organization_invitation_created', 'organization_invitation_updated',
  'staff_assignment_updated', 'billing_profile_updated'
));

create function public.create_clinic_doctor_invitation(
  requested_clinic_id uuid,
  requested_email text,
  request_correlation_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  manager_id uuid;
  invitation_id uuid;
  raw_token text := encode(gen_random_bytes(32), 'hex');
  normalized_email text := lower(btrim(requested_email));
  metadata jsonb := '{"changed_fields":["invitation_status"]}'::jsonb;
begin
  select manager.id into manager_id
  from public.clinic_manager_profiles manager
  join public.clinic_manager_memberships membership
    on membership.clinic_manager_id = manager.id
  join public.clinics clinic on clinic.id = membership.clinic_id
  where manager.auth_user_id = auth.uid()
    and manager.status = 'active'
    and membership.clinic_id = requested_clinic_id
    and membership.status = 'active'
    and clinic.status = 'active';
  if manager_id is null
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise insufficient_privilege;
  end if;
  insert into public.organization_invitations (
    invitation_kind, clinic_id, inviting_manager_id, invited_email,
    token_digest, expires_at
  ) values (
    'clinic_doctor', requested_clinic_id, manager_id, normalized_email,
    digest(raw_token, 'sha256'), now() + interval '7 days'
  )
  returning id into invitation_id;
  perform public.assert_safe_audit_metadata(metadata);
  insert into public.audit_events (
    actor_auth_user_id, actor_clinic_manager_id, action, resource_type,
    resource_id, correlation_id, safe_metadata
  ) values (
    auth.uid(), manager_id, 'organization_invitation_created',
    'organization_invitations', invitation_id, request_correlation_id, metadata
  );
  return raw_token;
end;
$$;

create function public.create_doctor_staff_invitation(
  requested_email text,
  request_correlation_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinician_id uuid;
  invitation_id uuid;
  raw_token text := encode(gen_random_bytes(32), 'hex');
  normalized_email text := lower(btrim(requested_email));
  metadata jsonb := '{"changed_fields":["invitation_status"]}'::jsonb;
begin
  select clinician.id into clinician_id
  from public.clinicians clinician
  where clinician.auth_user_id = auth.uid()
    and clinician.verification_status = 'approved';
  if clinician_id is null
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise insufficient_privilege;
  end if;
  insert into public.organization_invitations (
    invitation_kind, inviting_clinician_id, invited_email,
    token_digest, expires_at
  ) values (
    'doctor_staff', clinician_id, normalized_email,
    digest(raw_token, 'sha256'), now() + interval '7 days'
  )
  returning id into invitation_id;
  perform public.assert_safe_audit_metadata(metadata);
  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, action, resource_type,
    resource_id, correlation_id, safe_metadata
  ) values (
    auth.uid(), clinician_id, 'organization_invitation_created',
    'organization_invitations', invitation_id, request_correlation_id, metadata
  );
  return raw_token;
end;
$$;

create function public.set_clinic_doctor_membership_status(
  requested_membership_id uuid,
  new_status public.organization_membership_status,
  request_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  manager_id uuid;
  membership_row public.clinic_doctor_memberships%rowtype;
  metadata jsonb := '{"changed_fields":["status"]}'::jsonb;
begin
  select * into membership_row
  from public.clinic_doctor_memberships membership
  where membership.id = requested_membership_id
  for update;
  select manager.id into manager_id
  from public.clinic_manager_profiles manager
  join public.clinic_manager_memberships membership
    on membership.clinic_manager_id = manager.id
  join public.clinics clinic on clinic.id = membership.clinic_id
  where manager.auth_user_id = auth.uid()
    and manager.status = 'active'
    and membership.clinic_id = membership_row.clinic_id
    and membership.status = 'active'
    and clinic.status = 'active';
  if membership_row.id is null or manager_id is null
    or new_status not in ('active', 'suspended', 'ended') then
    raise insufficient_privilege;
  end if;
  if membership_row.status = new_status then
    raise exception 'membership status is unchanged' using errcode = '22000';
  end if;
  update public.clinic_doctor_memberships set
    status = new_status,
    starts_on = case
      when new_status = 'active' then coalesce(starts_on, current_date)
      else starts_on
    end,
    ends_before = case
      when new_status = 'ended'
        then greatest(current_date, coalesce(starts_on, current_date) + 1)
      when new_status = 'active' then null
      else ends_before
    end
  where id = requested_membership_id;
  if new_status in ('suspended', 'ended') then
    update public.clinic_sponsorship_periods set
      effective_until = current_date
    where clinic_id = membership_row.clinic_id
      and clinician_id = membership_row.clinician_id
      and effective_until is null;
  elsif new_status = 'active' and not exists (
    select 1 from public.clinic_sponsorship_periods period
    where period.clinic_id = membership_row.clinic_id
      and period.clinician_id = membership_row.clinician_id
      and period.effective_until is null
  ) then
    insert into public.clinic_sponsorship_periods (
      clinic_id, clinician_id, effective_from, created_by_manager_id
    ) values (
      membership_row.clinic_id, membership_row.clinician_id,
      current_date, manager_id
    );
  end if;
  perform public.assert_safe_audit_metadata(metadata);
  insert into public.audit_events (
    actor_auth_user_id, actor_clinic_manager_id, action, resource_type,
    resource_id, correlation_id, safe_metadata
  ) values (
    auth.uid(), manager_id, 'clinic_membership_updated',
    'clinic_doctor_memberships', requested_membership_id,
    request_correlation_id, metadata
  );
end;
$$;

revoke all on function public.create_clinic_doctor_invitation(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.create_doctor_staff_invitation(text, uuid)
  from public, anon, authenticated;
revoke all on function public.set_clinic_doctor_membership_status(
  uuid, public.organization_membership_status, uuid
) from public, anon, authenticated;
grant execute on function public.create_clinic_doctor_invitation(uuid, text, uuid)
  to authenticated;
grant execute on function public.create_doctor_staff_invitation(text, uuid)
  to authenticated;
grant execute on function public.set_clinic_doctor_membership_status(
  uuid, public.organization_membership_status, uuid
) to authenticated;

create function public.update_my_billing_profile(
  requested_clinic_id uuid,
  new_legal_name text,
  new_fiscal_identifier text,
  new_vat_identifier text,
  new_trade_register_number text,
  new_billing_address text,
  new_billing_country text,
  new_billing_email text,
  new_billing_contact text,
  request_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinician_id uuid;
  manager_id uuid;
  billing_profile_id uuid;
  previous_profile public.billing_profiles%rowtype;
  normalized_legal_name text := nullif(btrim(new_legal_name), '');
  normalized_fiscal_identifier text :=
    nullif(btrim(new_fiscal_identifier), '');
  normalized_vat_identifier text := nullif(btrim(new_vat_identifier), '');
  normalized_trade_register text :=
    nullif(btrim(new_trade_register_number), '');
  normalized_address text := nullif(btrim(new_billing_address), '');
  normalized_country text := upper(nullif(btrim(new_billing_country), ''));
  normalized_email text := lower(nullif(btrim(new_billing_email), ''));
  normalized_contact text := nullif(btrim(new_billing_contact), '');
  changed_fields text[] := array[]::text[];
  metadata jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if requested_clinic_id is null then
    select clinician.id into clinician_id
    from public.clinicians clinician
    where clinician.auth_user_id = auth.uid()
      and clinician.verification_status = 'approved';
    if clinician_id is null then raise insufficient_privilege; end if;
    select * into previous_profile
    from public.billing_profiles profile
    where profile.clinician_id = clinician_id
    for update;
  else
    select manager.id into manager_id
    from public.clinic_manager_profiles manager
    join public.clinic_manager_memberships membership
      on membership.clinic_manager_id = manager.id
    join public.clinics clinic on clinic.id = membership.clinic_id
    where manager.auth_user_id = auth.uid()
      and manager.status = 'active'
      and membership.clinic_id = requested_clinic_id
      and membership.status = 'active'
      and clinic.status = 'active';
    if manager_id is null then raise insufficient_privilege; end if;
    select * into previous_profile
    from public.billing_profiles profile
    where profile.clinic_id = requested_clinic_id
    for update;
  end if;
  if previous_profile.id is null then raise insufficient_privilege; end if;
  billing_profile_id := previous_profile.id;

  if previous_profile.legal_name is distinct from normalized_legal_name then
    changed_fields := array_append(changed_fields, 'legal_name');
  end if;
  if previous_profile.fiscal_identifier is distinct from normalized_fiscal_identifier then
    changed_fields := array_append(changed_fields, 'fiscal_identifier');
  end if;
  if previous_profile.vat_identifier is distinct from normalized_vat_identifier then
    changed_fields := array_append(changed_fields, 'vat_identifier');
  end if;
  if previous_profile.trade_register_number is distinct from normalized_trade_register then
    changed_fields := array_append(changed_fields, 'trade_register_number');
  end if;
  if previous_profile.billing_address is distinct from normalized_address then
    changed_fields := array_append(changed_fields, 'billing_address');
  end if;
  if previous_profile.billing_country is distinct from normalized_country then
    changed_fields := array_append(changed_fields, 'billing_country');
  end if;
  if previous_profile.billing_email is distinct from normalized_email then
    changed_fields := array_append(changed_fields, 'billing_email');
  end if;
  if previous_profile.billing_contact is distinct from normalized_contact then
    changed_fields := array_append(changed_fields, 'billing_contact');
  end if;
  if cardinality(changed_fields) = 0 then
    raise exception 'no billing fields changed' using errcode = '22000';
  end if;

  update public.billing_profiles set
    legal_name = normalized_legal_name,
    fiscal_identifier = normalized_fiscal_identifier,
    vat_identifier = normalized_vat_identifier,
    trade_register_number = normalized_trade_register,
    billing_address = normalized_address,
    billing_country = normalized_country,
    billing_email = normalized_email,
    billing_contact = normalized_contact,
    status = case
      when normalized_legal_name is not null
        and normalized_fiscal_identifier is not null
        and normalized_address is not null
        and normalized_country is not null
        and normalized_email is not null then 'active'
      else 'incomplete'
    end
  where id = billing_profile_id;

  metadata := jsonb_build_object('changed_fields', changed_fields);
  perform public.assert_safe_audit_metadata(metadata);
  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, actor_clinic_manager_id,
    action, resource_type, resource_id, correlation_id, safe_metadata
  ) values (
    auth.uid(), clinician_id, manager_id, 'billing_profile_updated',
    'billing_profiles', billing_profile_id, request_correlation_id, metadata
  );
end;
$$;

revoke all on function public.update_my_billing_profile(
  uuid, text, text, text, text, text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.update_my_billing_profile(
  uuid, text, text, text, text, text, text, text, text, uuid
) to authenticated;

alter table public.account_identities enable row level security;
alter table public.clinic_manager_profiles enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.clinics enable row level security;
alter table public.clinic_manager_memberships enable row level security;
alter table public.clinic_doctor_memberships enable row level security;
alter table public.clinic_sponsorship_periods enable row level security;
alter table public.staff_doctor_assignments enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.billing_profiles enable row level security;

create policy account_identity_read_self on public.account_identities
for select to authenticated
using (auth_user_id = (select auth.uid()));
create policy clinic_manager_read_self on public.clinic_manager_profiles
for select to authenticated
using (auth_user_id = (select auth.uid()));
create policy staff_read_self on public.staff_profiles
for select to authenticated
using (auth_user_id = (select auth.uid()));
create policy clinic_manager_memberships_read_self
on public.clinic_manager_memberships for select to authenticated
using (exists (
  select 1 from public.clinic_manager_profiles manager
  where manager.id = clinic_manager_id
    and manager.auth_user_id = (select auth.uid())
));
create policy clinic_doctor_memberships_read_participant
on public.clinic_doctor_memberships for select to authenticated
using (
  exists (
    select 1 from public.clinicians clinician
    where clinician.id = clinician_id
      and clinician.auth_user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.clinic_manager_memberships membership
    join public.clinic_manager_profiles manager
      on manager.id = membership.clinic_manager_id
    where membership.clinic_id = clinic_doctor_memberships.clinic_id
      and membership.status = 'active'
      and manager.auth_user_id = (select auth.uid())
  )
);
create policy clinics_read_member on public.clinics for select to authenticated
using (
  exists (
    select 1
    from public.clinic_manager_memberships membership
    join public.clinic_manager_profiles manager
      on manager.id = membership.clinic_manager_id
    where membership.clinic_id = clinics.id
      and membership.status = 'active'
      and manager.auth_user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.clinic_doctor_memberships membership
    join public.clinicians clinician on clinician.id = membership.clinician_id
    where membership.clinic_id = clinics.id
      and membership.status = 'active'
      and clinician.auth_user_id = (select auth.uid())
  )
);
create policy sponsorships_read_participant
on public.clinic_sponsorship_periods for select to authenticated
using (
  exists (
    select 1 from public.clinicians clinician
    where clinician.id = clinician_id
      and clinician.auth_user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.clinic_manager_memberships membership
    join public.clinic_manager_profiles manager
      on manager.id = membership.clinic_manager_id
    where membership.clinic_id = clinic_sponsorship_periods.clinic_id
      and membership.status = 'active'
      and manager.auth_user_id = (select auth.uid())
  )
);
create policy staff_assignments_read_participant
on public.staff_doctor_assignments for select to authenticated
using (
  exists (
    select 1 from public.staff_profiles staff
    where staff.id = staff_id and staff.auth_user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.clinicians clinician
    where clinician.id = clinician_id
      and clinician.auth_user_id = (select auth.uid())
  )
);
create policy billing_profiles_read_owner on public.billing_profiles
for select to authenticated
using (
  exists (
    select 1 from public.clinicians clinician
    where clinician.id = billing_profiles.clinician_id
      and clinician.auth_user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.clinic_manager_memberships membership
    join public.clinic_manager_profiles manager
      on manager.id = membership.clinic_manager_id
    where membership.clinic_id = billing_profiles.clinic_id
      and membership.status = 'active'
      and manager.auth_user_id = (select auth.uid())
  )
);

create policy account_identities_superadmin_read
on public.account_identities for select to authenticated
using (private.is_active_superadmin());
create policy clinic_managers_superadmin_manage
on public.clinic_manager_profiles for all to authenticated
using (private.is_active_superadmin())
with check (private.is_active_superadmin());
create policy staff_superadmin_manage on public.staff_profiles
for all to authenticated
using (private.is_active_superadmin())
with check (private.is_active_superadmin());
create policy clinics_superadmin_manage on public.clinics
for all to authenticated
using (private.is_active_superadmin())
with check (private.is_active_superadmin());
create policy clinic_manager_memberships_superadmin_manage
on public.clinic_manager_memberships for all to authenticated
using (private.is_active_superadmin())
with check (private.is_active_superadmin());
create policy clinic_doctor_memberships_superadmin_manage
on public.clinic_doctor_memberships for all to authenticated
using (private.is_active_superadmin())
with check (private.is_active_superadmin());
create policy sponsorships_superadmin_manage
on public.clinic_sponsorship_periods for all to authenticated
using (private.is_active_superadmin())
with check (private.is_active_superadmin());
create policy staff_assignments_superadmin_manage
on public.staff_doctor_assignments for all to authenticated
using (private.is_active_superadmin())
with check (private.is_active_superadmin());
create policy invitations_superadmin_manage
on public.organization_invitations for all to authenticated
using (private.is_active_superadmin())
with check (private.is_active_superadmin());
create policy billing_profiles_superadmin_manage
on public.billing_profiles for all to authenticated
using (private.is_active_superadmin())
with check (private.is_active_superadmin());

revoke all on table public.account_identities,
  public.clinic_manager_profiles, public.staff_profiles, public.clinics,
  public.clinic_manager_memberships, public.clinic_doctor_memberships,
  public.clinic_sponsorship_periods, public.staff_doctor_assignments,
  public.organization_invitations, public.billing_profiles
from public, anon, authenticated;
grant select on table public.account_identities,
  public.clinic_manager_profiles, public.staff_profiles, public.clinics,
  public.clinic_manager_memberships, public.clinic_doctor_memberships,
  public.clinic_sponsorship_periods, public.staff_doctor_assignments,
  public.billing_profiles
to authenticated;
grant insert, update on table
  public.clinic_manager_profiles, public.staff_profiles, public.clinics,
  public.clinic_manager_memberships, public.clinic_doctor_memberships,
  public.clinic_sponsorship_periods, public.staff_doctor_assignments,
  public.organization_invitations, public.billing_profiles
to authenticated;

comment on table public.account_identities is
  'One immutable VitaPass account type per Supabase Auth user.';
comment on table public.clinic_sponsorship_periods is
  'Effective intervals are half-open: effective_from is included and effective_until is excluded.';
comment on table public.organization_invitations is
  'Only a SHA-256 invitation token digest is stored; raw invitation tokens must never be persisted.';

commit;
