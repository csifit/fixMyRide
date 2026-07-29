begin;

create extension if not exists pgcrypto;

create type public.clinician_verification_status as enum
  ('pending', 'approved', 'suspended', 'rejected');
create type public.access_grant_status as enum
  ('pending', 'active', 'revoked', 'expired');
create type public.clinical_record_status as enum
  ('active', 'inactive', 'resolved', 'discontinued');

create table public.clinicians (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete restrict,
  full_name text not null check (char_length(full_name) between 2 and 160),
  specialty text not null check (char_length(specialty) between 2 and 120),
  clinic_name text not null check (char_length(clinic_name) between 2 and 160),
  clinic_country char(2) not null check (clinic_country = upper(clinic_country)),
  professional_identifier text not null unique check (char_length(professional_identifier) between 3 and 80),
  verification_status public.clinician_verification_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete restrict,
  vitapass_id text not null unique check (vitapass_id ~ '^VP-[0-9]{4}-[0-9]{4}$'),
  full_name text not null check (char_length(full_name) between 2 and 160),
  date_of_birth date not null check (date_of_birth <= current_date),
  blood_group text check (blood_group in ('A', 'B', 'AB', 'O')),
  rh_factor text check (rh_factor in ('positive', 'negative')),
  sex text not null check (sex in ('female', 'male', 'intersex', 'unknown')),
  organ_donor boolean,
  family_doctor_id uuid references public.clinicians(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.allergies (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  allergen_key text,
  allergen_name text not null check (char_length(allergen_name) between 1 and 160),
  clinical_note text check (char_length(clinical_note) <= 2000),
  status public.clinical_record_status not null default 'active'
    check (status in ('active', 'inactive', 'resolved')),
  identified_at date,
  resolved_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (resolved_at is null or status = 'resolved')
);

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  medication_name text not null check (char_length(medication_name) between 1 and 200),
  dosage text not null check (char_length(dosage) between 1 and 120),
  schedule_key text,
  clinical_note text check (char_length(clinical_note) <= 2000),
  status public.clinical_record_status not null default 'active'
    check (status in ('active', 'inactive', 'discontinued')),
  started_at date,
  ended_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or status = 'discontinued')
);

create table public.chronic_conditions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  condition_key text,
  condition_name text not null check (char_length(condition_name) between 1 and 200),
  clinical_note text check (char_length(clinical_note) <= 2000),
  status public.clinical_record_status not null default 'active'
    check (status in ('active', 'inactive', 'resolved')),
  diagnosed_at date,
  resolved_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (resolved_at is null or status = 'resolved')
);

create table public.surgeries (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  procedure_key text,
  procedure_name text not null check (char_length(procedure_name) between 1 and 200),
  procedure_date date,
  clinical_note text check (char_length(clinical_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.implants_and_devices (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  device_key text,
  device_name text not null check (char_length(device_name) between 1 and 200),
  status public.clinical_record_status not null default 'active'
    check (status in ('active', 'inactive')),
  implanted_at date,
  removed_at date,
  clinical_note text check (char_length(clinical_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (removed_at is null or status = 'inactive')
);

create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 160),
  relationship_key text not null check (char_length(relationship_key) between 1 and 80),
  phone_number text not null check (char_length(phone_number) between 5 and 40),
  priority smallint not null default 1 check (priority between 1 and 10),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patient_access_grants (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  clinician_id uuid not null references public.clinicians(id) on delete cascade,
  status public.access_grant_status not null default 'pending',
  can_view boolean not null default true,
  can_edit boolean not null default false,
  granted_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not can_edit or can_view),
  check (status <> 'active' or granted_at is not null),
  check (status <> 'revoked' or revoked_at is not null),
  check (expires_at is null or granted_at is null or expires_at > granted_at)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_auth_user_id uuid references auth.users(id) on delete restrict,
  actor_clinician_id uuid references public.clinicians(id) on delete restrict,
  action text not null check (action in (
    'sign_in', 'sign_out', 'access_denied', 'patient_profile_viewed',
    'patient_profile_updated', 'access_grant_created',
    'access_grant_approved', 'access_grant_revoked'
  )),
  patient_id uuid references public.patients(id) on delete restrict,
  resource_type text not null check (char_length(resource_type) between 1 and 80),
  resource_id uuid,
  correlation_id uuid not null,
  occurred_at timestamptz not null default now(),
  safe_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(safe_metadata) = 'object')
);

create index clinicians_auth_user_idx on public.clinicians(auth_user_id);
create index clinicians_status_idx on public.clinicians(verification_status);
create index patients_auth_user_idx on public.patients(auth_user_id);
create index patients_family_doctor_idx on public.patients(family_doctor_id);
create index allergies_patient_status_idx on public.allergies(patient_id, status);
create index medications_patient_status_idx on public.medications(patient_id, status);
create index conditions_patient_status_idx on public.chronic_conditions(patient_id, status);
create index surgeries_patient_idx on public.surgeries(patient_id);
create index implants_patient_status_idx on public.implants_and_devices(patient_id, status);
create index contacts_patient_active_idx on public.emergency_contacts(patient_id, is_active);
create index grants_clinician_status_idx on public.patient_access_grants(clinician_id, status);
create index grants_patient_status_idx on public.patient_access_grants(patient_id, status);
create unique index grants_one_live_pair_idx
  on public.patient_access_grants(patient_id, clinician_id)
  where status in ('pending', 'active');
create index audit_actor_time_idx on public.audit_events(actor_auth_user_id, occurred_at desc);
create index audit_patient_time_idx on public.audit_events(patient_id, occurred_at desc);
create index audit_correlation_idx on public.audit_events(correlation_id);

create function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clinicians_updated_at before update on public.clinicians
  for each row execute function public.set_updated_at();
create trigger patients_updated_at before update on public.patients
  for each row execute function public.set_updated_at();
create trigger allergies_updated_at before update on public.allergies
  for each row execute function public.set_updated_at();
create trigger medications_updated_at before update on public.medications
  for each row execute function public.set_updated_at();
create trigger conditions_updated_at before update on public.chronic_conditions
  for each row execute function public.set_updated_at();
create trigger surgeries_updated_at before update on public.surgeries
  for each row execute function public.set_updated_at();
create trigger implants_updated_at before update on public.implants_and_devices
  for each row execute function public.set_updated_at();
create trigger contacts_updated_at before update on public.emergency_contacts
  for each row execute function public.set_updated_at();
create trigger grants_updated_at before update on public.patient_access_grants
  for each row execute function public.set_updated_at();

create function public.current_clinician_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.clinicians
  where auth_user_id = (select auth.uid())
    and verification_status = 'approved'
  limit 1
$$;

create function public.has_patient_access(
  requested_patient_id uuid,
  require_edit boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.patient_access_grants grant_row
    join public.clinicians clinician on clinician.id = grant_row.clinician_id
    where grant_row.patient_id = requested_patient_id
      and clinician.auth_user_id = (select auth.uid())
      and clinician.verification_status = 'approved'
      and grant_row.status = 'active'
      and grant_row.can_view
      and (not require_edit or grant_row.can_edit)
      and grant_row.revoked_at is null
      and (grant_row.expires_at is null or grant_row.expires_at > now())
  )
$$;

revoke all on function public.current_clinician_id() from public;
revoke all on function public.has_patient_access(uuid, boolean) from public;
grant execute on function public.current_clinician_id() to authenticated;
grant execute on function public.has_patient_access(uuid, boolean) to authenticated;

alter table public.clinicians enable row level security;
alter table public.patients enable row level security;
alter table public.allergies enable row level security;
alter table public.medications enable row level security;
alter table public.chronic_conditions enable row level security;
alter table public.surgeries enable row level security;
alter table public.implants_and_devices enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.patient_access_grants enable row level security;
alter table public.audit_events enable row level security;

create policy clinicians_read_self on public.clinicians for select to authenticated
  using (auth_user_id = (select auth.uid()));
create policy patients_read_authorized on public.patients for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    or public.has_patient_access(id, false)
  );

create policy allergies_read_authorized on public.allergies for select to authenticated
  using (
    exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = (select auth.uid()))
    or public.has_patient_access(patient_id, false)
  );
create policy allergies_edit_clinician on public.allergies for update to authenticated
  using (public.has_patient_access(patient_id, true))
  with check (public.has_patient_access(patient_id, true));

create policy medications_read_authorized on public.medications for select to authenticated
  using (
    exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = (select auth.uid()))
    or public.has_patient_access(patient_id, false)
  );
create policy medications_edit_clinician on public.medications for update to authenticated
  using (public.has_patient_access(patient_id, true))
  with check (public.has_patient_access(patient_id, true));

create policy conditions_read_authorized on public.chronic_conditions for select to authenticated
  using (
    exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = (select auth.uid()))
    or public.has_patient_access(patient_id, false)
  );
create policy conditions_edit_clinician on public.chronic_conditions for update to authenticated
  using (public.has_patient_access(patient_id, true))
  with check (public.has_patient_access(patient_id, true));

create policy surgeries_read_authorized on public.surgeries for select to authenticated
  using (
    exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = (select auth.uid()))
    or public.has_patient_access(patient_id, false)
  );
create policy surgeries_edit_clinician on public.surgeries for update to authenticated
  using (public.has_patient_access(patient_id, true))
  with check (public.has_patient_access(patient_id, true));

create policy implants_read_authorized on public.implants_and_devices for select to authenticated
  using (
    exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = (select auth.uid()))
    or public.has_patient_access(patient_id, false)
  );
create policy implants_edit_clinician on public.implants_and_devices for update to authenticated
  using (public.has_patient_access(patient_id, true))
  with check (public.has_patient_access(patient_id, true));

create policy contacts_read_authorized on public.emergency_contacts for select to authenticated
  using (
    exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = (select auth.uid()))
    or public.has_patient_access(patient_id, false)
  );
create policy contacts_edit_clinician on public.emergency_contacts for update to authenticated
  using (public.has_patient_access(patient_id, true))
  with check (public.has_patient_access(patient_id, true));

create policy grants_read_participant on public.patient_access_grants for select to authenticated
  using (
    exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = (select auth.uid()))
    or clinician_id = public.current_clinician_id()
  );

create policy audit_read_own on public.audit_events for select to authenticated
  using (actor_auth_user_id = (select auth.uid()));

create function public.reject_audit_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'audit events are append-only';
end;
$$;

create trigger audit_events_immutable
before update or delete on public.audit_events
for each row execute function public.reject_audit_mutation();

create function public.audit_access_grant_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_action text;
  clinician_actor_id uuid;
begin
  if tg_op = 'INSERT' then
    audit_action := 'access_grant_created';
  elsif old.status = 'pending' and new.status = 'active' then
    audit_action := 'access_grant_approved';
  elsif old.status <> 'revoked' and new.status = 'revoked' then
    audit_action := 'access_grant_revoked';
  else
    return new;
  end if;
  select id into clinician_actor_id from public.clinicians
    where auth_user_id = auth.uid() limit 1;
  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, action, patient_id,
    resource_type, resource_id, correlation_id, safe_metadata
  ) values (
    auth.uid(), clinician_actor_id, audit_action, new.patient_id,
    'access_grant', new.id, gen_random_uuid(),
    jsonb_build_object('grant_id', new.id)
  );
  return new;
end;
$$;

create trigger patient_access_grants_audit
after insert or update on public.patient_access_grants
for each row execute function public.audit_access_grant_change();

create function public.assert_safe_audit_metadata(metadata jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  metadata_key text;
begin
  if jsonb_typeof(metadata) <> 'object' or pg_column_size(metadata) > 4096 then
    raise exception 'invalid audit metadata';
  end if;
  for metadata_key in select jsonb_object_keys(metadata)
  loop
    if metadata_key not in (
      'changed_fields', 'grant_id', 'verification_status', 'denial_reason',
      'source', 'result'
    ) then
      raise exception 'unsafe audit metadata key';
    end if;
  end loop;
end;
$$;

create function public.get_patient_profile(
  requested_patient_id uuid,
  request_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinician_id uuid := public.current_clinician_id();
  profile jsonb;
begin
  if clinician_id is null or not public.has_patient_access(requested_patient_id, false) then
    if auth.uid() is not null then
      insert into public.audit_events (
        actor_auth_user_id, actor_clinician_id, action, patient_id,
        resource_type, resource_id, correlation_id, safe_metadata
      ) values (
        auth.uid(), clinician_id, 'access_denied', null,
        'patient_profile', requested_patient_id, request_correlation_id,
        '{"denial_reason":"authorization_failed"}'::jsonb
      );
    end if;
    return null;
  end if;

  select jsonb_build_object(
    'patient', to_jsonb(patient_row),
    'allergies', coalesce((select jsonb_agg(to_jsonb(a)) from public.allergies a where a.patient_id = patient_row.id and a.status = 'active'), '[]'::jsonb),
    'medications', coalesce((select jsonb_agg(to_jsonb(m)) from public.medications m where m.patient_id = patient_row.id and m.status = 'active'), '[]'::jsonb),
    'conditions', coalesce((select jsonb_agg(to_jsonb(c)) from public.chronic_conditions c where c.patient_id = patient_row.id and c.status = 'active'), '[]'::jsonb)
  )
  into profile
  from public.patients patient_row
  where patient_row.id = requested_patient_id;

  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, action, patient_id,
    resource_type, resource_id, correlation_id, safe_metadata
  ) values (
    auth.uid(), clinician_id, 'patient_profile_viewed', requested_patient_id,
    'patient_profile', requested_patient_id, request_correlation_id,
    '{"source":"doctor_portal"}'::jsonb
  );

  return profile;
end;
$$;

create function public.update_chronic_condition_note(
  condition_id uuid,
  new_clinical_note text,
  request_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinician_id uuid := public.current_clinician_id();
  target_patient_id uuid;
  metadata jsonb := '{"changed_fields":["clinical_note"]}'::jsonb;
begin
  if char_length(new_clinical_note) > 2000 then
    raise check_violation;
  end if;
  select patient_id into target_patient_id
  from public.chronic_conditions where id = condition_id;
  if target_patient_id is null
    or clinician_id is null
    or not public.has_patient_access(target_patient_id, true) then
    raise insufficient_privilege;
  end if;

  perform public.assert_safe_audit_metadata(metadata);
  update public.chronic_conditions
    set clinical_note = nullif(btrim(new_clinical_note), '')
    where id = condition_id;
  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, action, patient_id,
    resource_type, resource_id, correlation_id, safe_metadata
  ) values (
    auth.uid(), clinician_id, 'patient_profile_updated', target_patient_id,
    'chronic_condition', condition_id, request_correlation_id, metadata
  );
end;
$$;

create function public.record_auth_audit(
  auth_action text,
  request_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinician_id uuid;
begin
  if auth_action not in ('sign_in', 'sign_out') or auth.uid() is null then
    raise insufficient_privilege;
  end if;
  select id into clinician_id from public.clinicians
    where auth_user_id = auth.uid() limit 1;
  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, action, resource_type,
    correlation_id, safe_metadata
  ) values (
    auth.uid(), clinician_id, auth_action, 'auth_session',
    request_correlation_id, '{}'::jsonb
  );
end;
$$;

revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.current_clinician_id() to authenticated;
grant execute on function public.has_patient_access(uuid, boolean) to authenticated;
grant execute on function public.get_patient_profile(uuid, uuid) to authenticated;
grant execute on function public.update_chronic_condition_note(uuid, text, uuid) to authenticated;
grant execute on function public.record_auth_audit(text, uuid) to authenticated;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.clinicians to authenticated;
grant select on public.patient_access_grants to authenticated;
grant select on public.audit_events to authenticated;

commit;
