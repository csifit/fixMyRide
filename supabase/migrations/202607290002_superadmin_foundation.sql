begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.application_administrator_role as enum
  ('superadmin', 'admin');
create type public.application_administrator_status as enum
  ('active', 'suspended');

create table public.application_administrators (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  role public.application_administrator_role not null,
  status public.application_administrator_status not null default 'active',
  display_name text not null check (char_length(display_name) between 2 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.application_administrators(id) on delete restrict
);

comment on table public.application_administrators is
  'Bootstrap the first superadmin only through a trusted manual SQL session after creating the Auth user. Never store bootstrap identity or credential values in migrations.';

create index application_administrators_auth_user_idx
  on public.application_administrators(auth_user_id);
create index application_administrators_role_status_idx
  on public.application_administrators(role, status);

create trigger application_administrators_updated_at
before update on public.application_administrators
for each row execute function public.set_updated_at();

alter table public.patients
  add column archived_at timestamptz;

alter table public.audit_events
  add column actor_administrator_id uuid
    references public.application_administrators(id) on delete restrict;

create index audit_administrator_time_idx
  on public.audit_events(actor_administrator_id, occurred_at desc);

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
    'patient_archived', 'medical_record_created', 'medical_record_updated'
  ));

create function private.is_active_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.jwt()->>'aal') = 'aal2'
    and exists (
      select 1
      from public.application_administrators administrator
      where administrator.auth_user_id = (select auth.uid())
        and administrator.role = 'superadmin'
        and administrator.status = 'active'
    )
$$;

create function private.administrator_mfa_allows_privileged_operation()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    not exists (
      select 1
      from public.application_administrators administrator
      where administrator.auth_user_id = (select auth.uid())
    )
    or (select auth.jwt()->>'aal') = 'aal2'
$$;

revoke all on function private.is_active_superadmin()
  from public, anon, authenticated;
revoke all on function private.administrator_mfa_allows_privileged_operation()
  from public, anon, authenticated;
grant execute on function private.is_active_superadmin() to authenticated;

-- Pre-MFA identity discovery exposes only the row linked to the caller. It is
-- intentionally narrow so the app can distinguish an unauthorized account,
-- a suspended account, and an active account that still requires MFA without
-- granting direct pre-MFA table access.
create function public.get_my_administrator_identity()
returns table (
  id uuid,
  auth_user_id uuid,
  role public.application_administrator_role,
  status public.application_administrator_status,
  display_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    administrator.id,
    administrator.auth_user_id,
    administrator.role,
    administrator.status,
    administrator.display_name
  from public.application_administrators administrator
  where administrator.auth_user_id = (select auth.uid())
  limit 1
$$;

revoke all on function public.get_my_administrator_identity()
  from public, anon, authenticated;
grant execute on function public.get_my_administrator_identity()
  to authenticated;

alter table public.application_administrators enable row level security;

create policy administrators_superadmin_read
on public.application_administrators
for select to authenticated
using ((select private.is_active_superadmin()));

create policy administrators_superadmin_create
on public.application_administrators
for insert to authenticated
with check (
  (select private.is_active_superadmin())
  and auth_user_id <> (select auth.uid())
);

create policy administrators_superadmin_update
on public.application_administrators
for update to authenticated
using (
  (select private.is_active_superadmin())
  and auth_user_id <> (select auth.uid())
)
with check (
  (select private.is_active_superadmin())
  and auth_user_id <> (select auth.uid())
);

-- Each managed table has one Superadmin policy. DELETE remains unavailable
-- because table privileges below explicitly revoke it.
create policy clinicians_superadmin_manage
on public.clinicians
for all to authenticated
using ((select private.is_active_superadmin()))
with check ((select private.is_active_superadmin()));

create policy patients_superadmin_manage
on public.patients
for all to authenticated
using ((select private.is_active_superadmin()))
with check ((select private.is_active_superadmin()));

create policy allergies_superadmin_manage
on public.allergies
for all to authenticated
using ((select private.is_active_superadmin()))
with check ((select private.is_active_superadmin()));

create policy medications_superadmin_manage
on public.medications
for all to authenticated
using ((select private.is_active_superadmin()))
with check ((select private.is_active_superadmin()));

create policy conditions_superadmin_manage
on public.chronic_conditions
for all to authenticated
using ((select private.is_active_superadmin()))
with check ((select private.is_active_superadmin()));

create policy surgeries_superadmin_manage
on public.surgeries
for all to authenticated
using ((select private.is_active_superadmin()))
with check ((select private.is_active_superadmin()));

create policy implants_superadmin_manage
on public.implants_and_devices
for all to authenticated
using ((select private.is_active_superadmin()))
with check ((select private.is_active_superadmin()));

create policy contacts_superadmin_manage
on public.emergency_contacts
for all to authenticated
using ((select private.is_active_superadmin()))
with check ((select private.is_active_superadmin()));

create policy grants_superadmin_manage
on public.patient_access_grants
for all to authenticated
using ((select private.is_active_superadmin()))
with check ((select private.is_active_superadmin()));

create policy audit_superadmin_read
on public.audit_events
for select to authenticated
using ((select private.is_active_superadmin()));

-- Doctors perform the one supported medical edit through the audited,
-- purpose-specific update_chronic_condition_note RPC below. Removing these
-- Phase 2B.1 policies avoids a second direct Data API write path.
drop policy allergies_edit_clinician on public.allergies;
drop policy medications_edit_clinician on public.medications;
drop policy conditions_edit_clinician on public.chronic_conditions;
drop policy surgeries_edit_clinician on public.surgeries;
drop policy implants_edit_clinician on public.implants_and_devices;
drop policy contacts_edit_clinician on public.emergency_contacts;

-- SECURITY DEFINER functions execute as their owner and therefore bypass RLS.
-- Every doctor-facing definer path must explicitly reject an identity linked
-- to application_administrators unless the current JWT is aal2.
create or replace function public.current_clinician_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.clinicians
  where (select private.administrator_mfa_allows_privileged_operation())
    and auth_user_id = (select auth.uid())
    and verification_status = 'approved'
  limit 1
$$;

create or replace function public.has_patient_access(
  requested_patient_id uuid,
  require_edit boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select private.administrator_mfa_allows_privileged_operation())
    and exists (
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
  clinician_id uuid := public.current_clinician_id();
  administrator_id uuid;
  profile jsonb;
begin
  select id into administrator_id
  from public.application_administrators
  where auth_user_id = auth.uid()
  limit 1;

  if not private.administrator_mfa_allows_privileged_operation()
    or clinician_id is null
    or not public.has_patient_access(requested_patient_id, false) then
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
    'patient', to_jsonb(patient_row),
    'allergies', coalesce((select jsonb_agg(to_jsonb(a)) from public.allergies a where a.patient_id = patient_row.id and a.status = 'active'), '[]'::jsonb),
    'medications', coalesce((select jsonb_agg(to_jsonb(m)) from public.medications m where m.patient_id = patient_row.id and m.status = 'active'), '[]'::jsonb),
    'conditions', coalesce((select jsonb_agg(to_jsonb(c)) from public.chronic_conditions c where c.patient_id = patient_row.id and c.status = 'active'), '[]'::jsonb)
  )
  into profile
  from public.patients patient_row
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

create or replace function public.update_chronic_condition_note(
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
  administrator_id uuid;
  target_patient_id uuid;
  metadata jsonb := '{"changed_fields":["clinical_note"]}'::jsonb;
begin
  if not private.administrator_mfa_allows_privileged_operation() then
    raise insufficient_privilege;
  end if;
  if char_length(new_clinical_note) > 2000 then
    raise check_violation;
  end if;
  select patient_id into target_patient_id
  from public.chronic_conditions
  where id = condition_id;
  if target_patient_id is null
    or clinician_id is null
    or not public.has_patient_access(target_patient_id, true) then
    raise insufficient_privilege;
  end if;
  select id into administrator_id
  from public.application_administrators
  where auth_user_id = auth.uid()
  limit 1;

  perform public.assert_safe_audit_metadata(metadata);
  update public.chronic_conditions
    set clinical_note = nullif(btrim(new_clinical_note), '')
    where id = condition_id;
  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, actor_administrator_id,
    action, patient_id, resource_type, resource_id, correlation_id,
    safe_metadata
  ) values (
    auth.uid(), clinician_id, administrator_id,
    'patient_profile_updated', target_patient_id, 'chronic_condition',
    condition_id, request_correlation_id, metadata
  );
end;
$$;

create function private.audit_superadmin_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_admin_id uuid;
  audit_action text;
  target_id uuid;
  target_patient_id uuid;
  row_data jsonb;
begin
  row_data := to_jsonb(new);
  target_id := (row_data->>'id')::uuid;

  select administrator.id into actor_admin_id
  from public.application_administrators administrator
  where administrator.auth_user_id = auth.uid()
    and administrator.role = 'superadmin'
    and administrator.status = 'active'
  limit 1;

  if actor_admin_id is null
    or (select auth.jwt()->>'aal') is distinct from 'aal2' then
    return new;
  end if;

  if tg_table_name = 'application_administrators' then
    if tg_op = 'INSERT' then
      audit_action := 'administrator_created';
    elsif old.status <> 'suspended' and new.status = 'suspended' then
      audit_action := 'administrator_suspended';
    else
      audit_action := 'administrator_updated';
    end if;
  elsif tg_table_name = 'clinicians' then
    if tg_op = 'INSERT' then
      audit_action := 'clinician_created';
    elsif old.verification_status <> 'approved'
      and new.verification_status = 'approved' then
      audit_action := 'clinician_approved';
    elsif old.verification_status <> 'suspended'
      and new.verification_status = 'suspended' then
      audit_action := 'clinician_suspended';
    else
      audit_action := 'clinician_updated';
    end if;
  elsif tg_table_name = 'patients' then
    target_patient_id := target_id;
    if tg_op = 'INSERT' then
      audit_action := 'patient_created';
    elsif old.archived_at is null and new.archived_at is not null then
      audit_action := 'patient_archived';
    else
      audit_action := 'patient_updated';
    end if;
  else
    target_patient_id := (row_data->>'patient_id')::uuid;
    audit_action := case
      when tg_op = 'INSERT' then 'medical_record_created'
      else 'medical_record_updated'
    end;
  end if;

  insert into public.audit_events (
    actor_auth_user_id, actor_administrator_id, action, patient_id,
    resource_type, resource_id, correlation_id, safe_metadata
  ) values (
    auth.uid(), actor_admin_id, audit_action, target_patient_id,
    tg_table_name, target_id, gen_random_uuid(),
    '{"source":"superadmin_portal","result":"success"}'::jsonb
  );
  return new;
end;
$$;

create trigger application_administrators_superadmin_audit
after insert or update on public.application_administrators
for each row execute function private.audit_superadmin_mutation();
create trigger clinicians_superadmin_audit
after insert or update on public.clinicians
for each row execute function private.audit_superadmin_mutation();
create trigger patients_superadmin_audit
after insert or update on public.patients
for each row execute function private.audit_superadmin_mutation();
create trigger allergies_superadmin_audit
after insert or update on public.allergies
for each row execute function private.audit_superadmin_mutation();
create trigger medications_superadmin_audit
after insert or update on public.medications
for each row execute function private.audit_superadmin_mutation();
create trigger conditions_superadmin_audit
after insert or update on public.chronic_conditions
for each row execute function private.audit_superadmin_mutation();
create trigger surgeries_superadmin_audit
after insert or update on public.surgeries
for each row execute function private.audit_superadmin_mutation();
create trigger implants_superadmin_audit
after insert or update on public.implants_and_devices
for each row execute function private.audit_superadmin_mutation();
create trigger contacts_superadmin_audit
after insert or update on public.emergency_contacts
for each row execute function private.audit_superadmin_mutation();

create or replace function public.audit_access_grant_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_action text;
  clinician_actor_id uuid;
  administrator_actor_id uuid;
begin
  if tg_op = 'INSERT' then
    audit_action := 'access_grant_created';
  elsif old.status = 'pending' and new.status = 'active' then
    audit_action := 'access_grant_approved';
  elsif old.status <> 'revoked' and new.status = 'revoked' then
    audit_action := 'access_grant_revoked';
  else
    audit_action := 'access_grant_updated';
  end if;

  select id into clinician_actor_id
  from public.clinicians
  where auth_user_id = auth.uid()
  limit 1;
  select id into administrator_actor_id
  from public.application_administrators
  where auth_user_id = auth.uid()
  limit 1;

  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, actor_administrator_id,
    action, patient_id, resource_type, resource_id, correlation_id,
    safe_metadata
  ) values (
    auth.uid(), clinician_actor_id, administrator_actor_id,
    audit_action, new.patient_id, 'access_grant', new.id,
    gen_random_uuid(), jsonb_build_object('grant_id', new.id)
  );
  return new;
end;
$$;

create or replace function public.record_auth_audit(
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
  administrator_id uuid;
  recent_event_count integer;
begin
  if auth_action not in ('sign_in', 'sign_out') or auth.uid() is null then
    raise insufficient_privilege;
  end if;
  select id into clinician_id
  from public.clinicians
  where auth_user_id = auth.uid()
  limit 1;
  select id into administrator_id
  from public.application_administrators
  where auth_user_id = auth.uid()
  limit 1;
  if clinician_id is null and administrator_id is null then
    raise insufficient_privilege;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text, 202607290002)
  );
  if exists (
    select 1
    from public.audit_events event
    where event.actor_auth_user_id = auth.uid()
      and event.action = auth_action
      and event.occurred_at > now() - interval '30 seconds'
  ) then
    raise exception 'duplicate authentication audit event'
      using errcode = '54000';
  end if;
  select count(*) into recent_event_count
  from public.audit_events event
  where event.actor_auth_user_id = auth.uid()
    and event.action in ('sign_in', 'sign_out')
    and event.occurred_at > now() - interval '1 hour';
  if recent_event_count >= 20 then
    raise exception 'authentication audit event rate exceeded'
      using errcode = '54000';
  end if;

  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, actor_administrator_id,
    action, resource_type, correlation_id, safe_metadata
  ) values (
    auth.uid(), clinician_id, administrator_id, auth_action,
    'auth_session', request_correlation_id, '{}'::jsonb
  );
end;
$$;

comment on function public.record_auth_audit(text, uuid) is
  'Application sign-in/sign-out events are supplemental and caller-generated. Supabase Auth audit logs are authoritative for authentication activity.';

revoke all on function private.audit_superadmin_mutation()
  from public, anon, authenticated;
revoke all on function public.audit_access_grant_change()
  from public, anon, authenticated;
revoke all on function public.record_auth_audit(text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_auth_audit(text, uuid) to authenticated;

revoke all on table public.application_administrators from anon, authenticated;
grant select, insert, update
  on table public.application_administrators to authenticated;

grant select, insert, update on table public.clinicians to authenticated;
grant select, insert, update on table public.patients to authenticated;
grant select, insert, update on table public.allergies to authenticated;
grant select, insert, update on table public.medications to authenticated;
grant select, insert, update on table public.chronic_conditions to authenticated;
grant select, insert, update on table public.surgeries to authenticated;
grant select, insert, update on table public.implants_and_devices to authenticated;
grant select, insert, update on table public.emergency_contacts to authenticated;
grant select, insert, update on table public.patient_access_grants to authenticated;
grant select on table public.audit_events to authenticated;

revoke delete, truncate
  on table public.application_administrators, public.clinicians,
  public.patients, public.allergies, public.medications,
  public.chronic_conditions, public.surgeries,
  public.implants_and_devices, public.emergency_contacts,
  public.patient_access_grants, public.audit_events
  from anon, authenticated;
revoke insert, update, delete, truncate
  on table public.audit_events from anon, authenticated;

commit;
