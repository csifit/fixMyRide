begin;

create type public.patient_account_status as enum
  ('active', 'suspended', 'blocked');

alter table public.patients
  add column account_status public.patient_account_status not null default 'active',
  add column account_phone text
    check (account_phone is null or char_length(account_phone) between 5 and 40),
  add column preferred_language text not null default 'ro'
    check (preferred_language in ('en', 'de', 'ro', 'hu')),
  add column account_status_reason text
    check (account_status_reason is null or char_length(account_status_reason) <= 500),
  add column account_status_changed_at timestamptz not null default now(),
  add column account_status_changed_by_administrator_id uuid
    references public.application_administrators(id) on delete restrict;

create index patients_account_status_idx
  on public.patients(account_status, created_at desc);

create table public.patient_account_status_history (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  previous_status public.patient_account_status,
  new_status public.patient_account_status not null,
  reason text check (reason is null or char_length(reason) <= 500),
  changed_by_administrator_id uuid not null
    references public.application_administrators(id) on delete restrict,
  changed_at timestamptz not null default now()
);

create index patient_account_status_history_time_idx
  on public.patient_account_status_history(patient_id, changed_at desc);

alter table public.patient_account_status_history enable row level security;
revoke all on table public.patient_account_status_history
  from public, anon, authenticated;

-- Replace the original Patient-own read conditions instead of layering
-- additional restrictive policies. Doctor access continues through the
-- existing medical relationship helper.
drop policy patients_read_authorized on public.patients;
create policy patients_read_authorized on public.patients for select to authenticated
  using (
    (
      auth_user_id = (select auth.uid())
      and account_status = 'active'
      and archived_at is null
    )
    or public.has_patient_access(id, false)
  );

drop policy allergies_read_authorized on public.allergies;
create policy allergies_read_authorized on public.allergies for select to authenticated
  using (
    exists (
      select 1 from public.patients patient
      where patient.id = patient_id
        and patient.auth_user_id = (select auth.uid())
        and patient.account_status = 'active'
        and patient.archived_at is null
    )
    or public.has_patient_access(patient_id, false)
  );

drop policy medications_read_authorized on public.medications;
create policy medications_read_authorized on public.medications for select to authenticated
  using (
    exists (
      select 1 from public.patients patient
      where patient.id = patient_id
        and patient.auth_user_id = (select auth.uid())
        and patient.account_status = 'active'
        and patient.archived_at is null
    )
    or public.has_patient_access(patient_id, false)
  );

drop policy conditions_read_authorized on public.chronic_conditions;
create policy conditions_read_authorized on public.chronic_conditions for select to authenticated
  using (
    exists (
      select 1 from public.patients patient
      where patient.id = patient_id
        and patient.auth_user_id = (select auth.uid())
        and patient.account_status = 'active'
        and patient.archived_at is null
    )
    or public.has_patient_access(patient_id, false)
  );

drop policy surgeries_read_authorized on public.surgeries;
create policy surgeries_read_authorized on public.surgeries for select to authenticated
  using (
    exists (
      select 1 from public.patients patient
      where patient.id = patient_id
        and patient.auth_user_id = (select auth.uid())
        and patient.account_status = 'active'
        and patient.archived_at is null
    )
    or public.has_patient_access(patient_id, false)
  );

drop policy implants_read_authorized on public.implants_and_devices;
create policy implants_read_authorized on public.implants_and_devices for select to authenticated
  using (
    exists (
      select 1 from public.patients patient
      where patient.id = patient_id
        and patient.auth_user_id = (select auth.uid())
        and patient.account_status = 'active'
        and patient.archived_at is null
    )
    or public.has_patient_access(patient_id, false)
  );

drop policy contacts_read_authorized on public.emergency_contacts;
create policy contacts_read_authorized on public.emergency_contacts for select to authenticated
  using (
    exists (
      select 1 from public.patients patient
      where patient.id = patient_id
        and patient.auth_user_id = (select auth.uid())
        and patient.account_status = 'active'
        and patient.archived_at is null
    )
    or public.has_patient_access(patient_id, false)
  );

drop policy grants_read_participant on public.patient_access_grants;
create policy grants_read_participant on public.patient_access_grants for select to authenticated
  using (
    exists (
      select 1 from public.patients patient
      where patient.id = patient_id
        and patient.auth_user_id = (select auth.uid())
        and patient.account_status = 'active'
        and patient.archived_at is null
    )
    or clinician_id = public.current_clinician_id()
  );

create function public.update_admin_patient_account(
  requested_patient_id uuid,
  new_full_name text,
  new_family_name text,
  new_given_names text,
  new_account_phone text,
  new_preferred_language text,
  new_account_status public.patient_account_status,
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
  previous_status public.patient_account_status;
  patient_archived_at timestamptz;
  normalized_family_name text := nullif(btrim(new_family_name), '');
  normalized_given_names text := nullif(btrim(new_given_names), '');
begin
  if actor_id is null then raise insufficient_privilege; end if;
  if (normalized_family_name is null) <> (normalized_given_names is null) then
    raise exception 'Family name and given names must be supplied together'
      using errcode = '23514';
  end if;
  if new_preferred_language not in ('en', 'de', 'ro', 'hu') then
    raise exception 'Unsupported preferred language' using errcode = '23514';
  end if;

  select patient.account_status, patient.archived_at
    into previous_status, patient_archived_at
  from public.patients patient
  where patient.id = requested_patient_id
  for update;
  if previous_status is null then
    raise exception 'Patient account not found' using errcode = 'P0002';
  end if;
  if patient_archived_at is not null then
    raise exception 'Archived Patient history cannot be reactivated here'
      using errcode = '23514';
  end if;

  update public.patients patient set
    full_name = btrim(new_full_name),
    family_name = normalized_family_name,
    given_names = normalized_given_names,
    account_phone = nullif(btrim(new_account_phone), ''),
    preferred_language = new_preferred_language,
    account_status = new_account_status,
    account_status_reason = case when new_account_status = 'active' then null
      else nullif(btrim(status_reason), '') end,
    account_status_changed_at = case
      when patient.account_status is distinct from new_account_status then now()
      else patient.account_status_changed_at end,
    account_status_changed_by_administrator_id = case
      when patient.account_status is distinct from new_account_status then actor_id
      else patient.account_status_changed_by_administrator_id end
  where patient.id = requested_patient_id;

  if previous_status is distinct from new_account_status then
    insert into public.patient_account_status_history (
      patient_id, previous_status, new_status, reason,
      changed_by_administrator_id
    ) values (
      requested_patient_id, previous_status, new_account_status,
      case when new_account_status = 'active' then null
        else nullif(btrim(status_reason), '') end,
      actor_id
    );
  end if;

  insert into public.audit_events (
    actor_auth_user_id, actor_administrator_id, action, patient_id,
    resource_type, resource_id, correlation_id, safe_metadata
  ) values (
    auth.uid(), actor_id, 'patient_updated', requested_patient_id,
    'patient_account', requested_patient_id, request_correlation_id,
    '{"changed_fields":["name","account_phone","preferred_language","account_status"]}'::jsonb
  );
end;
$$;

create function public.get_admin_patient_operations_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.is_active_platform_admin() then jsonb_build_object(
    'count', (select count(*) from public.patients),
    'patients', coalesce((select jsonb_agg(jsonb_build_object(
      'id', patient.id,
      'vitapass_id', patient.vitapass_id,
      'email', user_account.email,
      'email_confirmed_at', user_account.email_confirmed_at,
      'last_sign_in_at', user_account.last_sign_in_at,
      'full_name', patient.full_name,
      'family_name', patient.family_name,
      'given_names', patient.given_names,
      'account_phone', patient.account_phone,
      'preferred_language', patient.preferred_language,
      'account_status', patient.account_status,
      'account_status_reason', patient.account_status_reason,
      'account_status_changed_at', patient.account_status_changed_at,
      'archived_at', patient.archived_at,
      'status_history', coalesce((select jsonb_agg(jsonb_build_object(
        'previous_status', history.previous_status,
        'new_status', history.new_status,
        'reason', history.reason,
        'changed_at', history.changed_at
      ) order by history.changed_at desc)
      from public.patient_account_status_history history
      where history.patient_id = patient.id), '[]'::jsonb),
      'created_at', patient.created_at
    ) order by patient.created_at desc)
    from public.patients patient
    left join auth.users user_account on user_account.id = patient.auth_user_id),
    '[]'::jsonb)
  ) else null end
$$;

create function public.get_my_patient_account_identity()
returns table (
  patient_id uuid,
  full_name text,
  account_status public.patient_account_status,
  archived boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select patient.id, patient.full_name, patient.account_status,
    patient.archived_at is not null
  from public.patients patient
  where patient.auth_user_id = (select auth.uid())
  limit 1
$$;

create or replace function private.current_patient_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select patient.id
  from public.patients patient
  where patient.auth_user_id = (select auth.uid())
    and patient.account_status = 'active'
    and patient.archived_at is null
  limit 1
$$;

revoke all on function public.update_admin_patient_account(
  uuid, text, text, text, text, text, public.patient_account_status, text, uuid
) from public, anon, authenticated;
grant execute on function public.update_admin_patient_account(
  uuid, text, text, text, text, text, public.patient_account_status, text, uuid
) to authenticated;
revoke all on function public.get_admin_patient_operations_snapshot()
  from public, anon, authenticated;
grant execute on function public.get_admin_patient_operations_snapshot()
  to authenticated;
revoke all on function public.get_my_patient_account_identity()
  from public, anon, authenticated;
grant execute on function public.get_my_patient_account_identity()
  to authenticated;
revoke all on function private.current_patient_id()
  from public, anon, authenticated;

comment on column public.patients.account_status is
  'Controls Patient account access without deleting medical or appointment history.';
comment on table public.patient_account_status_history is
  'Append-only administrative Patient account lifecycle history.';

commit;
