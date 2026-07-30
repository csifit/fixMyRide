begin;

create type public.insurance_coverage_status as enum
  ('unknown', 'insured', 'uninsured', 'verification_pending');
create type public.insurance_verification_source as enum
  ('not_verified', 'cnas_manual_check', 'cnas_official_integration',
   'health_card', 'supporting_document', 'clinician_attestation');
create type public.medical_code_system as enum
  ('icd10', 'snomed_ct', 'other');

comment on type public.insurance_verification_source is
  'cnas_manual_check records a clinician-performed manual check. cnas_official_integration is reserved for a future official integration and is rejected by current constraints and RPCs.';

alter table public.patients
  add column family_name text
    check (family_name is null or char_length(family_name) between 1 and 100),
  add column given_names text
    check (given_names is null or char_length(given_names) between 1 and 140),
  add column insurance_status public.insurance_coverage_status
    not null default 'unknown',
  add column insurance_verification_source
    public.insurance_verification_source not null default 'not_verified',
  add column insurance_verified_at timestamptz,
  add column insurance_house_code text
    check (
      insurance_house_code is null
      or char_length(insurance_house_code) between 1 and 40
    ),
  add column insurance_house_name text
    check (
      insurance_house_name is null
      or char_length(insurance_house_name) between 1 and 160
    ),
  add column family_doctor_name text
    check (
      family_doctor_name is null
      or char_length(family_doctor_name) between 2 and 160
    ),
  add column family_doctor_professional_code text
    check (
      family_doctor_professional_code is null
      or char_length(family_doctor_professional_code) between 2 and 80
    ),
  add column family_doctor_telephone text
    check (
      family_doctor_telephone is null
      or char_length(family_doctor_telephone) between 5 and 40
    ),
  add column profile_verified_by_clinician_id uuid
    references public.clinicians(id) on delete restrict,
  add column profile_verified_by_administrator_id uuid
    references public.application_administrators(id) on delete restrict,
  add column profile_verified_at timestamptz,
  add constraint patients_split_name_pair_check check (
    (family_name is null) = (given_names is null)
  ),
  add constraint patients_insurance_verification_check check (
    (
      insurance_status in ('unknown', 'verification_pending')
      and insurance_verification_source = 'not_verified'
      and insurance_verified_at is null
    )
    or (
      insurance_status in ('insured', 'uninsured')
      and insurance_verification_source not in (
        'not_verified',
        'cnas_official_integration'
      )
      and insurance_verified_at is not null
    )
  ),
  add constraint patients_profile_verification_check check (
    (
      (profile_verified_by_clinician_id is not null)::integer
      + (profile_verified_by_administrator_id is not null)::integer
    ) = (profile_verified_at is not null)::integer
  );

comment on column public.patients.full_name is
  'Compatibility display name retained while family_name and given_names are introduced.';
comment on column public.patients.family_doctor_id is
  'Optional link when the family doctor is a VitaPass clinician. The accompanying name, professional code and telephone support external family doctors.';

create index patients_insurance_status_idx
  on public.patients(insurance_status);
create index patients_profile_verifier_idx
  on public.patients(profile_verified_by_clinician_id);
create index patients_profile_admin_verifier_idx
  on public.patients(profile_verified_by_administrator_id);

create table public.life_threatening_diagnoses (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null
    references public.patients(id) on delete cascade,
  diagnosis_name text not null
    check (char_length(diagnosis_name) between 2 and 240),
  code_system public.medical_code_system not null,
  diagnosis_code text not null
    check (char_length(diagnosis_code) between 1 and 80),
  code_system_other_name text
    check (
      code_system_other_name is null
      or char_length(code_system_other_name) between 2 and 120
    ),
  is_active boolean not null default true,
  verified_by_clinician_id uuid
    references public.clinicians(id) on delete restrict,
  verified_by_administrator_id uuid
    references public.application_administrators(id) on delete restrict,
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (code_system = 'other' and code_system_other_name is not null)
    or (code_system <> 'other' and code_system_other_name is null)
  ),
  check (
    (verified_by_clinician_id is not null)::integer
    + (verified_by_administrator_id is not null)::integer = 1
  )
);

create index life_threatening_diagnoses_patient_active_idx
  on public.life_threatening_diagnoses(patient_id, is_active);
create index life_threatening_diagnoses_verifier_idx
  on public.life_threatening_diagnoses(verified_by_clinician_id);
create unique index life_threatening_diagnoses_active_identity_idx
  on public.life_threatening_diagnoses(
    patient_id,
    code_system,
    lower(diagnosis_code),
    coalesce(lower(code_system_other_name), '')
  )
  where is_active;

create trigger life_threatening_diagnoses_updated_at
before update on public.life_threatening_diagnoses
for each row execute function public.set_updated_at();

create table public.patient_sensitive_identifiers (
  patient_id uuid primary key
    references public.patients(id) on delete cascade,
  cnp text
    check (cnp is null or cnp ~ '^[0-9]{13}$'),
  insurance_number text
    check (
      insurance_number is null
      or char_length(insurance_number) between 3 and 80
    ),
  health_card_number text
    check (
      health_card_number is null
      or char_length(health_card_number) between 3 and 80
    ),
  health_card_expires_at date,
  verified_by_clinician_id uuid
    references public.clinicians(id) on delete restrict,
  verified_by_administrator_id uuid
    references public.application_administrators(id) on delete restrict,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (
      (verified_by_clinician_id is not null)::integer
      + (verified_by_administrator_id is not null)::integer
    ) = (verified_at is not null)::integer
  )
);

comment on table public.patient_sensitive_identifiers is
  'Protected identifiers. Never include values in ordinary profiles, sharing payloads, audit metadata, logs or seed data. Access only through the audited purpose-specific RPCs.';

create trigger patient_sensitive_identifiers_updated_at
before update on public.patient_sensitive_identifiers
for each row execute function public.set_updated_at();

alter table public.life_threatening_diagnoses enable row level security;
alter table public.patient_sensitive_identifiers enable row level security;

create policy life_threatening_diagnoses_superadmin_read
on public.life_threatening_diagnoses
for select to authenticated
using ((select private.is_active_superadmin()));

-- There is deliberately no policy on patient_sensitive_identifiers. Even an
-- active Superadmin uses the audited RPCs below rather than direct table access.
revoke all on table public.patient_sensitive_identifiers
  from public, anon, authenticated;
revoke all on table public.life_threatening_diagnoses
  from public, anon, authenticated;
grant select on table public.life_threatening_diagnoses to authenticated;
revoke insert, update, delete, truncate
  on table public.life_threatening_diagnoses
  from anon, authenticated;

alter table public.audit_events
  drop constraint audit_events_action_check;
alter table public.audit_events
  add constraint audit_events_action_check check (action in (
    'sign_in', 'sign_out', 'access_denied', 'patient_profile_viewed',
    'patient_profile_updated', 'access_grant_created',
    'access_grant_approved', 'access_grant_revoked',
    'access_grant_updated', 'administrator_created',
    'administrator_updated', 'administrator_suspended',
    'clinician_created', 'clinician_updated', 'clinician_approved',
    'clinician_suspended', 'patient_created', 'patient_updated',
    'patient_archived', 'medical_record_created', 'medical_record_updated',
    'sensitive_identifiers_viewed', 'sensitive_identifiers_updated'
  ));

create function private.can_manage_patient_health_data(
  requested_patient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select private.is_active_superadmin())
    or (
      public.current_clinician_id() is not null
      and public.has_patient_access(requested_patient_id, true)
    )
$$;

revoke all on function private.can_manage_patient_health_data(uuid)
  from public, anon, authenticated;

-- Resolves one application actor for Phase 2C operations. An active AAL2
-- Superadmin always takes precedence over a clinician link on the same Auth
-- identity. At AAL1, administrator_mfa_allows_privileged_operation() makes the
-- clinician side resolve to null as well.
create function private.resolve_patient_health_actor()
returns table (
  clinician_id uuid,
  administrator_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  with active_administrator as (
    select administrator.id
    from public.application_administrators administrator
    where administrator.auth_user_id = (select auth.uid())
      and administrator.role = 'superadmin'
      and administrator.status = 'active'
      and (select auth.jwt()->>'aal') = 'aal2'
    limit 1
  )
  select
    case
      when active_administrator.id is not null then null
      else public.current_clinician_id()
    end,
    active_administrator.id
  from (values (true)) singleton(present)
  left join active_administrator on true
$$;

revoke all on function private.resolve_patient_health_actor()
  from public, anon, authenticated;

create function public.read_patient_sensitive_identifiers(
  requested_patient_id uuid,
  request_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinician_id uuid;
  administrator_id uuid;
  identifier_row public.patient_sensitive_identifiers%rowtype;
  verifier_name text;
  verifier_code text;
begin
  if auth.uid() is null
    or not private.can_manage_patient_health_data(
      requested_patient_id
    ) then
    raise insufficient_privilege;
  end if;

  select actor.clinician_id, actor.administrator_id
  into clinician_id, administrator_id
  from private.resolve_patient_health_actor() actor;

  select * into identifier_row
  from public.patient_sensitive_identifiers
  where patient_id = requested_patient_id;

  select
    coalesce(clinician.full_name, administrator.display_name),
    coalesce(clinician.professional_identifier, 'SUPERADMIN')
  into verifier_name, verifier_code
  from (values (true)) singleton(present)
  left join public.clinicians clinician
    on clinician.id = identifier_row.verified_by_clinician_id
  left join public.application_administrators administrator
    on administrator.id = identifier_row.verified_by_administrator_id;

  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, actor_administrator_id,
    action, patient_id, resource_type, resource_id, correlation_id,
    safe_metadata
  ) values (
    auth.uid(), clinician_id, administrator_id,
    'sensitive_identifiers_viewed', requested_patient_id,
    'patient_sensitive_identifiers', requested_patient_id,
    request_correlation_id, '{"source":"explicit_reveal"}'::jsonb
  );

  return jsonb_build_object(
    'cnp', identifier_row.cnp,
    'insurance_number', identifier_row.insurance_number,
    'health_card_number', identifier_row.health_card_number,
    'health_card_expires_at', identifier_row.health_card_expires_at,
    'verified_at', identifier_row.verified_at,
    'verified_by_name', verifier_name,
    'verified_by_code', verifier_code
  );
end;
$$;

create function public.update_patient_sensitive_identifiers(
  requested_patient_id uuid,
  new_cnp text,
  new_insurance_number text,
  new_health_card_number text,
  new_health_card_expires_at date,
  request_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinician_id uuid;
  administrator_id uuid;
  previous_row public.patient_sensitive_identifiers%rowtype;
  normalized_cnp text := nullif(btrim(new_cnp), '');
  normalized_insurance_number text :=
    nullif(btrim(new_insurance_number), '');
  normalized_health_card_number text :=
    nullif(btrim(new_health_card_number), '');
  changed_fields text[] := array[]::text[];
  metadata jsonb;
begin
  if auth.uid() is null
    or not private.can_manage_patient_health_data(
      requested_patient_id
    ) then
    raise insufficient_privilege;
  end if;

  if normalized_cnp is not null
    and normalized_cnp !~ '^[0-9]{13}$' then
    raise check_violation;
  end if;
  if normalized_insurance_number is not null
    and char_length(normalized_insurance_number) not between 3 and 80 then
    raise check_violation;
  end if;
  if normalized_health_card_number is not null
    and char_length(normalized_health_card_number) not between 3 and 80 then
    raise check_violation;
  end if;

  select actor.clinician_id, actor.administrator_id
  into clinician_id, administrator_id
  from private.resolve_patient_health_actor() actor;

  select * into previous_row
  from public.patient_sensitive_identifiers
  where patient_id = requested_patient_id
  for update;

  if previous_row.cnp is distinct from normalized_cnp then
    changed_fields := array_append(changed_fields, 'cnp');
  end if;
  if previous_row.insurance_number
    is distinct from normalized_insurance_number then
    changed_fields := array_append(changed_fields, 'insurance_number');
  end if;
  if previous_row.health_card_number
    is distinct from normalized_health_card_number then
    changed_fields := array_append(changed_fields, 'health_card_number');
  end if;
  if previous_row.health_card_expires_at
    is distinct from new_health_card_expires_at then
    changed_fields := array_append(
      changed_fields,
      'health_card_expires_at'
    );
  end if;
  if cardinality(changed_fields) = 0 then
    raise exception 'no identifier fields changed' using errcode = '22000';
  end if;

  insert into public.patient_sensitive_identifiers (
    patient_id, cnp, insurance_number, health_card_number,
    health_card_expires_at, verified_by_clinician_id,
    verified_by_administrator_id, verified_at
  ) values (
    requested_patient_id, normalized_cnp,
    normalized_insurance_number,
    normalized_health_card_number,
    new_health_card_expires_at, clinician_id, administrator_id, now()
  )
  on conflict (patient_id) do update set
    cnp = excluded.cnp,
    insurance_number = excluded.insurance_number,
    health_card_number = excluded.health_card_number,
    health_card_expires_at = excluded.health_card_expires_at,
    verified_by_clinician_id = excluded.verified_by_clinician_id,
    verified_by_administrator_id =
      excluded.verified_by_administrator_id,
    verified_at = excluded.verified_at;

  metadata := jsonb_build_object('changed_fields', changed_fields);
  perform public.assert_safe_audit_metadata(metadata);
  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, actor_administrator_id,
    action, patient_id, resource_type, resource_id, correlation_id,
    safe_metadata
  ) values (
    auth.uid(), clinician_id, administrator_id,
    'sensitive_identifiers_updated', requested_patient_id,
    'patient_sensitive_identifiers', requested_patient_id,
    request_correlation_id, metadata
  );
end;
$$;

revoke all on function public.read_patient_sensitive_identifiers(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.update_patient_sensitive_identifiers(
  uuid, text, text, text, date, uuid
) from public, anon, authenticated;
grant execute on function public.read_patient_sensitive_identifiers(uuid, uuid)
  to authenticated;
grant execute on function public.update_patient_sensitive_identifiers(
  uuid, text, text, text, date, uuid
) to authenticated;

create function public.update_patient_health_card_profile(
  requested_patient_id uuid,
  new_family_name text,
  new_given_names text,
  new_insurance_status public.insurance_coverage_status,
  new_insurance_verification_source
    public.insurance_verification_source,
  new_insurance_house_code text,
  new_insurance_house_name text,
  new_family_doctor_name text,
  new_family_doctor_professional_code text,
  new_family_doctor_telephone text,
  request_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinician_id uuid;
  administrator_id uuid;
  patient_row public.patients%rowtype;
  resolved_insurance_verified_at timestamptz;
  normalized_family_name text := nullif(btrim(new_family_name), '');
  normalized_given_names text := nullif(btrim(new_given_names), '');
  normalized_house_code text :=
    nullif(btrim(new_insurance_house_code), '');
  normalized_house_name text :=
    nullif(btrim(new_insurance_house_name), '');
  normalized_doctor_name text :=
    nullif(btrim(new_family_doctor_name), '');
  normalized_doctor_code text :=
    nullif(btrim(new_family_doctor_professional_code), '');
  normalized_doctor_telephone text :=
    nullif(btrim(new_family_doctor_telephone), '');
  changed_fields text[] := array[]::text[];
  metadata jsonb;
begin
  if auth.uid() is null
    or not private.can_manage_patient_health_data(
      requested_patient_id
    ) then
    raise insufficient_privilege;
  end if;

  if (normalized_family_name is null)
    <> (normalized_given_names is null) then
    raise check_violation;
  end if;
  if (
    new_insurance_status in ('insured', 'uninsured')
    and new_insurance_verification_source in (
      'not_verified',
      'cnas_official_integration'
    )
  ) or (
    new_insurance_status in ('unknown', 'verification_pending')
    and new_insurance_verification_source <> 'not_verified'
  ) then
    raise check_violation;
  end if;

  select actor.clinician_id, actor.administrator_id
  into clinician_id, administrator_id
  from private.resolve_patient_health_actor() actor;

  select * into patient_row
  from public.patients
  where id = requested_patient_id
  for update;
  if patient_row.id is null then
    raise no_data_found;
  end if;

  resolved_insurance_verified_at := case
    when new_insurance_status in ('unknown', 'verification_pending')
      then null
    when patient_row.insurance_status is not distinct from new_insurance_status
      and patient_row.insurance_verification_source
        is not distinct from new_insurance_verification_source
      then patient_row.insurance_verified_at
    else now()
  end;

  if patient_row.family_name is distinct from normalized_family_name then
    changed_fields := array_append(changed_fields, 'family_name');
  end if;
  if patient_row.given_names is distinct from normalized_given_names then
    changed_fields := array_append(changed_fields, 'given_names');
  end if;
  if patient_row.insurance_status
    is distinct from new_insurance_status then
    changed_fields := array_append(changed_fields, 'insurance_status');
  end if;
  if patient_row.insurance_verification_source
    is distinct from new_insurance_verification_source then
    changed_fields := array_append(
      changed_fields,
      'insurance_verification_source'
    );
  end if;
  if patient_row.insurance_verified_at
    is distinct from resolved_insurance_verified_at then
    changed_fields := array_append(
      changed_fields,
      'insurance_verified_at'
    );
  end if;
  if patient_row.insurance_house_code
    is distinct from normalized_house_code then
    changed_fields := array_append(changed_fields, 'insurance_house_code');
  end if;
  if patient_row.insurance_house_name
    is distinct from normalized_house_name then
    changed_fields := array_append(changed_fields, 'insurance_house_name');
  end if;
  if patient_row.family_doctor_name
    is distinct from normalized_doctor_name then
    changed_fields := array_append(changed_fields, 'family_doctor_name');
  end if;
  if patient_row.family_doctor_professional_code
    is distinct from normalized_doctor_code then
    changed_fields := array_append(
      changed_fields,
      'family_doctor_professional_code'
    );
  end if;
  if patient_row.family_doctor_telephone
    is distinct from normalized_doctor_telephone then
    changed_fields := array_append(
      changed_fields,
      'family_doctor_telephone'
    );
  end if;
  if cardinality(changed_fields) = 0 then
    raise exception 'no health-card profile fields changed'
      using errcode = '22000';
  end if;

  update public.patients set
    family_name = normalized_family_name,
    given_names = normalized_given_names,
    insurance_status = new_insurance_status,
    insurance_verification_source =
      new_insurance_verification_source,
    insurance_verified_at = resolved_insurance_verified_at,
    insurance_house_code = normalized_house_code,
    insurance_house_name = normalized_house_name,
    family_doctor_name = normalized_doctor_name,
    family_doctor_professional_code = normalized_doctor_code,
    family_doctor_telephone = normalized_doctor_telephone,
    profile_verified_by_clinician_id = clinician_id,
    profile_verified_by_administrator_id = administrator_id,
    profile_verified_at = now()
  where id = requested_patient_id;

  -- A Superadmin update is already audited once by the patients table trigger.
  -- Clinician writes bypass that Superadmin-only trigger and are audited here.
  if administrator_id is null then
    metadata := jsonb_build_object('changed_fields', changed_fields);
    perform public.assert_safe_audit_metadata(metadata);
    insert into public.audit_events (
      actor_auth_user_id, actor_clinician_id, action, patient_id,
      resource_type, resource_id, correlation_id, safe_metadata
    ) values (
      auth.uid(), clinician_id, 'patient_profile_updated',
      requested_patient_id, 'health_card_profile',
      requested_patient_id, request_correlation_id, metadata
    );
  end if;
end;
$$;

create function public.create_life_threatening_diagnosis(
  requested_patient_id uuid,
  new_diagnosis_name text,
  new_code_system public.medical_code_system,
  new_diagnosis_code text,
  new_code_system_other_name text,
  request_correlation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinician_id uuid;
  administrator_id uuid;
  diagnosis_id uuid;
  metadata jsonb := '{"changed_fields":[
    "diagnosis_name", "code_system", "diagnosis_code"
  ]}'::jsonb;
begin
  if auth.uid() is null
    or not private.can_manage_patient_health_data(
      requested_patient_id
    ) then
    raise insufficient_privilege;
  end if;
  if nullif(btrim(new_diagnosis_name), '') is null
    or nullif(btrim(new_diagnosis_code), '') is null
    or (
      new_code_system = 'other'
      and nullif(btrim(new_code_system_other_name), '') is null
    )
    or (
      new_code_system <> 'other'
      and nullif(btrim(new_code_system_other_name), '') is not null
    ) then
    raise check_violation;
  end if;

  select actor.clinician_id, actor.administrator_id
  into clinician_id, administrator_id
  from private.resolve_patient_health_actor() actor;

  insert into public.life_threatening_diagnoses (
    patient_id, diagnosis_name, code_system, diagnosis_code,
    code_system_other_name, verified_by_clinician_id,
    verified_by_administrator_id, verified_at
  ) values (
    requested_patient_id, btrim(new_diagnosis_name), new_code_system,
    btrim(new_diagnosis_code),
    nullif(btrim(new_code_system_other_name), ''),
    clinician_id, administrator_id, now()
  )
  returning id into diagnosis_id;

  if nullif(btrim(new_code_system_other_name), '') is not null then
    metadata := jsonb_set(
      metadata,
      '{changed_fields}',
      (metadata->'changed_fields') || '"code_system_other_name"'::jsonb
    );
  end if;
  perform public.assert_safe_audit_metadata(metadata);
  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, actor_administrator_id,
    action, patient_id, resource_type, resource_id, correlation_id,
    safe_metadata
  ) values (
    auth.uid(), clinician_id, administrator_id,
    'medical_record_created', requested_patient_id,
    'life_threatening_diagnoses', diagnosis_id,
    request_correlation_id, metadata
  );
  return diagnosis_id;
end;
$$;

create function public.update_life_threatening_diagnosis(
  diagnosis_id uuid,
  new_diagnosis_name text,
  new_code_system public.medical_code_system,
  new_diagnosis_code text,
  new_code_system_other_name text,
  request_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinician_id uuid;
  administrator_id uuid;
  diagnosis_row public.life_threatening_diagnoses%rowtype;
  normalized_name text := nullif(btrim(new_diagnosis_name), '');
  normalized_code text := nullif(btrim(new_diagnosis_code), '');
  normalized_other_name text :=
    nullif(btrim(new_code_system_other_name), '');
  changed_fields text[] := array[]::text[];
  metadata jsonb;
begin
  select * into diagnosis_row
  from public.life_threatening_diagnoses
  where id = diagnosis_id
  for update;
  if diagnosis_row.id is null
    or auth.uid() is null
    or not private.can_manage_patient_health_data(
      diagnosis_row.patient_id
    ) then
    raise insufficient_privilege;
  end if;
  if normalized_name is null or normalized_code is null
    or (new_code_system = 'other' and normalized_other_name is null)
    or (new_code_system <> 'other' and normalized_other_name is not null)
  then
    raise check_violation;
  end if;

  select actor.clinician_id, actor.administrator_id
  into clinician_id, administrator_id
  from private.resolve_patient_health_actor() actor;

  if diagnosis_row.diagnosis_name is distinct from normalized_name then
    changed_fields := array_append(changed_fields, 'diagnosis_name');
  end if;
  if diagnosis_row.code_system is distinct from new_code_system then
    changed_fields := array_append(changed_fields, 'code_system');
  end if;
  if diagnosis_row.diagnosis_code is distinct from normalized_code then
    changed_fields := array_append(changed_fields, 'diagnosis_code');
  end if;
  if diagnosis_row.code_system_other_name
    is distinct from normalized_other_name then
    changed_fields := array_append(
      changed_fields,
      'code_system_other_name'
    );
  end if;
  if cardinality(changed_fields) = 0 then
    raise exception 'no diagnosis fields changed' using errcode = '22000';
  end if;

  update public.life_threatening_diagnoses set
    diagnosis_name = normalized_name,
    code_system = new_code_system,
    diagnosis_code = normalized_code,
    code_system_other_name = normalized_other_name,
    verified_by_clinician_id = clinician_id,
    verified_by_administrator_id = administrator_id,
    verified_at = now()
  where id = diagnosis_id;

  metadata := jsonb_build_object('changed_fields', changed_fields);
  perform public.assert_safe_audit_metadata(metadata);
  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, actor_administrator_id,
    action, patient_id, resource_type, resource_id, correlation_id,
    safe_metadata
  ) values (
    auth.uid(), clinician_id, administrator_id,
    'medical_record_updated', diagnosis_row.patient_id,
    'life_threatening_diagnoses', diagnosis_id,
    request_correlation_id, metadata
  );
end;
$$;

create function public.deactivate_life_threatening_diagnosis(
  diagnosis_id uuid,
  request_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinician_id uuid;
  administrator_id uuid;
  diagnosis_row public.life_threatening_diagnoses%rowtype;
  metadata jsonb := '{"changed_fields":["is_active"]}'::jsonb;
begin
  select * into diagnosis_row
  from public.life_threatening_diagnoses
  where id = diagnosis_id
  for update;
  if diagnosis_row.id is null
    or auth.uid() is null
    or not private.can_manage_patient_health_data(
      diagnosis_row.patient_id
    ) then
    raise insufficient_privilege;
  end if;
  if not diagnosis_row.is_active then
    raise exception 'diagnosis is already inactive' using errcode = '22000';
  end if;

  select actor.clinician_id, actor.administrator_id
  into clinician_id, administrator_id
  from private.resolve_patient_health_actor() actor;

  update public.life_threatening_diagnoses set
    is_active = false,
    verified_by_clinician_id = clinician_id,
    verified_by_administrator_id = administrator_id,
    verified_at = now()
  where id = diagnosis_id;

  perform public.assert_safe_audit_metadata(metadata);
  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, actor_administrator_id,
    action, patient_id, resource_type, resource_id, correlation_id,
    safe_metadata
  ) values (
    auth.uid(), clinician_id, administrator_id,
    'medical_record_updated', diagnosis_row.patient_id,
    'life_threatening_diagnoses', diagnosis_id,
    request_correlation_id, metadata
  );
end;
$$;

create function public.reactivate_life_threatening_diagnosis(
  diagnosis_id uuid,
  request_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinician_id uuid;
  administrator_id uuid;
  diagnosis_row public.life_threatening_diagnoses%rowtype;
  metadata jsonb := '{"changed_fields":["is_active"]}'::jsonb;
begin
  select * into diagnosis_row
  from public.life_threatening_diagnoses
  where id = diagnosis_id
  for update;
  if diagnosis_row.id is null
    or auth.uid() is null
    or not private.can_manage_patient_health_data(
      diagnosis_row.patient_id
    ) then
    raise insufficient_privilege;
  end if;
  if diagnosis_row.is_active then
    raise exception 'diagnosis is already active' using errcode = '22000';
  end if;

  select actor.clinician_id, actor.administrator_id
  into clinician_id, administrator_id
  from private.resolve_patient_health_actor() actor;

  update public.life_threatening_diagnoses set
    is_active = true,
    verified_by_clinician_id = clinician_id,
    verified_by_administrator_id = administrator_id,
    verified_at = now()
  where id = diagnosis_id;

  perform public.assert_safe_audit_metadata(metadata);
  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, actor_administrator_id,
    action, patient_id, resource_type, resource_id, correlation_id,
    safe_metadata
  ) values (
    auth.uid(), clinician_id, administrator_id,
    'medical_record_updated', diagnosis_row.patient_id,
    'life_threatening_diagnoses', diagnosis_id,
    request_correlation_id, metadata
  );
end;
$$;

revoke all on function public.update_patient_health_card_profile(
  uuid, text, text, public.insurance_coverage_status,
  public.insurance_verification_source, text, text, text, text, text, uuid
) from public, anon, authenticated;
revoke all on function public.create_life_threatening_diagnosis(
  uuid, text, public.medical_code_system, text, text, uuid
) from public, anon, authenticated;
revoke all on function public.update_life_threatening_diagnosis(
  uuid, text, public.medical_code_system, text, text, uuid
) from public, anon, authenticated;
revoke all on function public.deactivate_life_threatening_diagnosis(
  uuid, uuid
) from public, anon, authenticated;
revoke all on function public.reactivate_life_threatening_diagnosis(
  uuid, uuid
) from public, anon, authenticated;
grant execute on function public.update_patient_health_card_profile(
  uuid, text, text, public.insurance_coverage_status,
  public.insurance_verification_source, text, text, text, text, text, uuid
) to authenticated;
grant execute on function public.create_life_threatening_diagnosis(
  uuid, text, public.medical_code_system, text, text, uuid
) to authenticated;
grant execute on function public.update_life_threatening_diagnosis(
  uuid, text, public.medical_code_system, text, text, uuid
) to authenticated;
grant execute on function public.deactivate_life_threatening_diagnosis(
  uuid, uuid
) to authenticated;
grant execute on function public.reactivate_life_threatening_diagnosis(
  uuid, uuid
) to authenticated;

create or replace function public.get_patient_profile(
  requested_patient_id uuid,
  request_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinician_id uuid;
  administrator_id uuid;
  profile jsonb;
begin
  select actor.clinician_id, actor.administrator_id
  into clinician_id, administrator_id
  from private.resolve_patient_health_actor() actor;

  if auth.uid() is null
    or (
      administrator_id is null
      and (
        clinician_id is null
        or not public.has_patient_access(requested_patient_id, false)
      )
    ) then
    if auth.uid() is not null then
      insert into public.audit_events (
        actor_auth_user_id, actor_clinician_id, actor_administrator_id,
        action, patient_id, resource_type, resource_id, correlation_id,
        safe_metadata
      ) values (
        auth.uid(), clinician_id, administrator_id, 'access_denied', null,
        'patient_profile', requested_patient_id, request_correlation_id,
        '{"denial_reason":"authorization_failed"}'::jsonb
      );
    end if;
    return null;
  end if;

  select jsonb_build_object(
    'patient', jsonb_build_object(
      'id', patient_row.id,
      'vitapass_id', patient_row.vitapass_id,
      'full_name', patient_row.full_name,
      'family_name', patient_row.family_name,
      'given_names', patient_row.given_names,
      'date_of_birth', patient_row.date_of_birth,
      'blood_group', patient_row.blood_group,
      'rh_factor', patient_row.rh_factor,
      'sex', patient_row.sex,
      'organ_donor', patient_row.organ_donor,
      'insurance_status', patient_row.insurance_status,
      'insurance_verification_source',
        patient_row.insurance_verification_source,
      'insurance_verified_at', patient_row.insurance_verified_at,
      'insurance_house_code', patient_row.insurance_house_code,
      'insurance_house_name', patient_row.insurance_house_name,
      'family_doctor_name',
        coalesce(patient_row.family_doctor_name, family_doctor.full_name),
      'family_doctor_professional_code',
        coalesce(
          patient_row.family_doctor_professional_code,
          family_doctor.professional_identifier
        ),
      'family_doctor_telephone', patient_row.family_doctor_telephone,
      'profile_verified_at', patient_row.profile_verified_at,
      'profile_verified_by_name',
        coalesce(
          profile_verifier.full_name,
          profile_admin_verifier.display_name
        ),
      'profile_verified_by_code',
        coalesce(profile_verifier.professional_identifier, 'SUPERADMIN'),
      'updated_at', patient_row.updated_at
    ),
    'allergies', coalesce((
      select jsonb_agg(to_jsonb(allergy_row))
      from public.allergies allergy_row
      where allergy_row.patient_id = patient_row.id
        and allergy_row.status = 'active'
    ), '[]'::jsonb),
    'medications', coalesce((
      select jsonb_agg(to_jsonb(medication_row))
      from public.medications medication_row
      where medication_row.patient_id = patient_row.id
        and medication_row.status = 'active'
    ), '[]'::jsonb),
    'conditions', coalesce((
      select jsonb_agg(to_jsonb(condition_row))
      from public.chronic_conditions condition_row
      where condition_row.patient_id = patient_row.id
        and condition_row.status = 'active'
    ), '[]'::jsonb),
    'emergency_contacts', coalesce((
      select jsonb_agg(to_jsonb(contact_row) order by contact_row.priority)
      from (
        select contact.id, contact.full_name, contact.relationship_key,
          contact.phone_number, contact.priority
        from public.emergency_contacts contact
        where contact.patient_id = patient_row.id
          and contact.is_active
        order by contact.priority
        limit 2
      ) contact_row
    ), '[]'::jsonb),
    'life_threatening_diagnoses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', diagnosis.id,
        'diagnosis_name', diagnosis.diagnosis_name,
        'code_system', diagnosis.code_system,
        'diagnosis_code', diagnosis.diagnosis_code,
        'code_system_other_name', diagnosis.code_system_other_name,
        'verified_at', diagnosis.verified_at,
        'verified_by_name',
          coalesce(verifier.full_name, admin_verifier.display_name),
        'verified_by_code',
          coalesce(verifier.professional_identifier, 'SUPERADMIN')
      ) order by diagnosis.diagnosis_name)
      from public.life_threatening_diagnoses diagnosis
      left join public.clinicians verifier
        on verifier.id = diagnosis.verified_by_clinician_id
      left join public.application_administrators admin_verifier
        on admin_verifier.id = diagnosis.verified_by_administrator_id
      where diagnosis.patient_id = patient_row.id
        and diagnosis.is_active
    ), '[]'::jsonb),
    'inactive_life_threatening_diagnoses',
      case
        when private.can_manage_patient_health_data(patient_row.id) then
          coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', diagnosis.id,
              'diagnosis_name', diagnosis.diagnosis_name,
              'code_system', diagnosis.code_system,
              'diagnosis_code', diagnosis.diagnosis_code,
              'code_system_other_name', diagnosis.code_system_other_name,
              'verified_at', diagnosis.verified_at,
              'verified_by_name',
                coalesce(
                  verifier.full_name,
                  admin_verifier.display_name
                ),
              'verified_by_code',
                coalesce(verifier.professional_identifier, 'SUPERADMIN')
            ) order by diagnosis.diagnosis_name)
            from public.life_threatening_diagnoses diagnosis
            left join public.clinicians verifier
              on verifier.id = diagnosis.verified_by_clinician_id
            left join public.application_administrators admin_verifier
              on admin_verifier.id =
                diagnosis.verified_by_administrator_id
            where diagnosis.patient_id = patient_row.id
              and not diagnosis.is_active
          ), '[]'::jsonb)
        else '[]'::jsonb
      end
  )
  into profile
  from public.patients patient_row
  left join public.clinicians family_doctor
    on family_doctor.id = patient_row.family_doctor_id
  left join public.clinicians profile_verifier
    on profile_verifier.id = patient_row.profile_verified_by_clinician_id
  left join public.application_administrators profile_admin_verifier
    on profile_admin_verifier.id =
      patient_row.profile_verified_by_administrator_id
  where patient_row.id = requested_patient_id;

  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, actor_administrator_id,
    action, patient_id, resource_type, resource_id, correlation_id,
    safe_metadata
  ) values (
    auth.uid(), clinician_id, administrator_id,
    'patient_profile_viewed', requested_patient_id, 'patient_profile',
    requested_patient_id, request_correlation_id,
    '{"source":"doctor_portal"}'::jsonb
  );

  return profile;
end;
$$;

commit;
