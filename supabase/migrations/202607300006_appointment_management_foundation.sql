begin;

create type public.appointment_source as enum (
  'online', 'phone', 'walk_in', 'email', 'other'
);
create type public.appointment_status as enum (
  'pending', 'confirmed', 'rescheduled', 'cancelled', 'completed', 'no_show'
);
create type public.appointment_notification_kind as enum (
  'confirmation', 'reminder_24h'
);
create type public.appointment_notification_status as enum (
  'pending', 'processing', 'sent', 'failed', 'cancelled'
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinician_id uuid not null references public.clinicians(id) on delete restrict,
  clinic_id uuid references public.clinics(id) on delete restrict,
  patient_id uuid references public.patients(id) on delete restrict,
  patient_name text not null check (char_length(patient_name) between 2 and 160),
  patient_phone text not null check (
    patient_phone ~ '^(07[0-9]{8}|00407[0-9]{8}|\+407[0-9]{8}|7[0-9]{8})$'
  ),
  patient_email text check (
    patient_email is null or char_length(patient_email) between 3 and 320
  ),
  source public.appointment_source not null,
  status public.appointment_status not null default 'pending',
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  timezone text not null default 'Europe/Bucharest'
    check (char_length(timezone) between 1 and 80),
  locale text not null default 'ro' check (locale in ('en', 'de', 'ro', 'hu')),
  operational_note text check (
    operational_note is null or char_length(operational_note) <= 500
  ),
  created_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  created_by_clinician_id uuid references public.clinicians(id) on delete restrict,
  created_by_staff_id uuid references public.staff_profiles(id) on delete restrict,
  status_changed_by_clinician_id uuid references public.clinicians(id) on delete restrict,
  status_changed_by_staff_id uuid references public.staff_profiles(id) on delete restrict,
  status_changed_at timestamptz not null default now(),
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start),
  check (
    (created_by_clinician_id is not null)::integer
      + (created_by_staff_id is not null)::integer = 1
  ),
  check (
    (status_changed_by_clinician_id is not null)::integer
      + (status_changed_by_staff_id is not null)::integer = 1
  ),
  check (status <> 'cancelled' or cancelled_at is not null),
  check (status <> 'completed' or completed_at is not null)
);

create index appointments_clinician_start_idx
  on public.appointments(clinician_id, scheduled_start);
create index appointments_patient_start_idx
  on public.appointments(patient_id, scheduled_start desc)
  where patient_id is not null;
create index appointments_status_start_idx
  on public.appointments(status, scheduled_start);
create trigger appointments_updated_at before update on public.appointments
for each row execute function public.set_updated_at();

create table public.appointment_notifications (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  kind public.appointment_notification_kind not null,
  status public.appointment_notification_status not null default 'pending',
  scheduled_for timestamptz not null,
  destination_phone text not null,
  locale text not null check (locale in ('en', 'de', 'ro', 'hu')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  provider_message_id text,
  last_error_code text,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, kind),
  check (status <> 'sent' or sent_at is not null)
);

create index appointment_notifications_due_idx
  on public.appointment_notifications(status, scheduled_for)
  where status in ('pending', 'failed');
create trigger appointment_notifications_updated_at
before update on public.appointment_notifications
for each row execute function public.set_updated_at();

alter table public.appointments enable row level security;
alter table public.appointment_notifications enable row level security;

create function private.current_appointment_actor()
returns table(clinician_id uuid, staff_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select clinician.id, null::uuid
  from public.clinicians clinician
  where clinician.auth_user_id = (select auth.uid())
    and clinician.verification_status = 'approved'
  union all
  select null::uuid, staff.id
  from public.staff_profiles staff
  where staff.auth_user_id = (select auth.uid())
    and staff.status = 'active'
  limit 1
$$;

revoke all on function private.current_appointment_actor()
  from public, anon, authenticated;

create function private.can_manage_doctor_appointments(
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
          and assignment.starts_on <= current_date
          and (assignment.ends_before is null
            or assignment.ends_before > current_date)
      )
  )
$$;

revoke all on function private.can_manage_doctor_appointments(uuid)
  from public, anon, authenticated;

create policy appointments_authorized_read
on public.appointments for select to authenticated
using (private.can_manage_doctor_appointments(clinician_id));

create function private.assert_appointment_slot_available(
  requested_clinician_id uuid,
  requested_start timestamptz,
  requested_end timestamptz,
  excluded_appointment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requested_clinician_id::text, 0)
  );
  if exists (
    select 1 from public.appointments appointment
    where appointment.clinician_id = requested_clinician_id
      and (excluded_appointment_id is null
        or appointment.id <> excluded_appointment_id)
      and appointment.status in ('confirmed', 'rescheduled')
      and tstzrange(
        appointment.scheduled_start, appointment.scheduled_end, '[)'
      ) && tstzrange(requested_start, requested_end, '[)')
  ) then
    raise exception 'The selected appointment time is unavailable'
      using errcode = '23P01';
  end if;
end;
$$;

revoke all on function private.assert_appointment_slot_available(
  uuid, timestamptz, timestamptz, uuid
) from public, anon, authenticated;

create function private.queue_appointment_notifications(
  requested_appointment_id uuid,
  include_confirmation boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment public.appointments%rowtype;
begin
  select * into appointment
  from public.appointments
  where id = requested_appointment_id;

  if include_confirmation then
    insert into public.appointment_notifications (
      appointment_id, kind, scheduled_for, destination_phone, locale
    ) values (
      appointment.id, 'confirmation', now(),
      appointment.patient_phone, appointment.locale
    )
    on conflict (appointment_id, kind) do nothing;
  end if;

  if appointment.scheduled_start > now() + interval '24 hours' then
    insert into public.appointment_notifications (
      appointment_id, kind, scheduled_for, destination_phone, locale
    ) values (
      appointment.id, 'reminder_24h',
      appointment.scheduled_start - interval '24 hours',
      appointment.patient_phone, appointment.locale
    )
    on conflict (appointment_id, kind) do update set
      status = 'pending',
      scheduled_for = excluded.scheduled_for,
      destination_phone = excluded.destination_phone,
      locale = excluded.locale,
      attempt_count = 0,
      provider_message_id = null,
      last_error_code = null,
      claimed_at = null,
      sent_at = null;
  else
    update public.appointment_notifications set status = 'cancelled'
    where appointment_id = appointment.id and kind = 'reminder_24h'
      and status <> 'sent';
  end if;
end;
$$;

revoke all on function private.queue_appointment_notifications(uuid, boolean)
  from public, anon, authenticated;

create function private.staff_has_patient_access(requested_patient_id uuid)
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
      and assignment.starts_on <= current_date
      and (assignment.ends_before is null
        or assignment.ends_before > current_date)
      and grant_row.patient_id = requested_patient_id
      and grant_row.status = 'active'
      and grant_row.can_view
      and grant_row.revoked_at is null
      and (grant_row.expires_at is null or grant_row.expires_at > now())
  )
$$;

revoke all on function private.staff_has_patient_access(uuid)
  from public, anon, authenticated;

create policy patients_staff_assigned_read
on public.patients for select to authenticated
using (private.staff_has_patient_access(id));
create policy allergies_staff_assigned_read
on public.allergies for select to authenticated
using (private.staff_has_patient_access(patient_id));
create policy medications_staff_assigned_read
on public.medications for select to authenticated
using (private.staff_has_patient_access(patient_id));
create policy conditions_staff_assigned_read
on public.chronic_conditions for select to authenticated
using (private.staff_has_patient_access(patient_id));
create policy surgeries_staff_assigned_read
on public.surgeries for select to authenticated
using (private.staff_has_patient_access(patient_id));
create policy implants_staff_assigned_read
on public.implants_and_devices for select to authenticated
using (private.staff_has_patient_access(patient_id));
create policy contacts_staff_assigned_read
on public.emergency_contacts for select to authenticated
using (private.staff_has_patient_access(patient_id));
create policy diagnoses_staff_assigned_read
on public.life_threatening_diagnoses for select to authenticated
using (private.staff_has_patient_access(patient_id));
create policy grants_staff_assigned_read
on public.patient_access_grants for select to authenticated
using (private.staff_has_patient_access(patient_id));

create function public.record_staff_patient_profile_view(
  requested_patient_id uuid,
  request_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_id uuid;
begin
  select staff.id into staff_id
  from public.staff_profiles staff
  where staff.auth_user_id = auth.uid() and staff.status = 'active';
  if staff_id is null
    or not private.staff_has_patient_access(requested_patient_id) then
    raise exception 'Patient access denied' using errcode = '42501';
  end if;
  insert into public.audit_events (
    actor_auth_user_id, actor_staff_id, action, patient_id, resource_type,
    resource_id, correlation_id, safe_metadata
  ) values (
    auth.uid(), staff_id, 'patient_profile_viewed', requested_patient_id,
    'patient_profile', requested_patient_id, request_correlation_id,
    '{"source":"staff_portal","access":"view_only"}'::jsonb
  );
end;
$$;

revoke all on function public.record_staff_patient_profile_view(uuid, uuid)
  from public, anon;
grant execute on function public.record_staff_patient_profile_view(uuid, uuid)
  to authenticated;

create function public.create_managed_appointment(
  requested_clinician_id uuid,
  requested_patient_id uuid,
  requested_patient_name text,
  requested_patient_phone text,
  requested_patient_email text,
  requested_source public.appointment_source,
  requested_scheduled_start timestamptz,
  requested_scheduled_end timestamptz,
  requested_locale text,
  requested_operational_note text,
  requested_initial_status public.appointment_status,
  request_correlation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  appointment_id uuid;
  normalized_name text := nullif(btrim(requested_patient_name), '');
  normalized_phone text := regexp_replace(requested_patient_phone, '[[:space:]-]', '', 'g');
begin
  select * into actor from private.current_appointment_actor();
  if auth.uid() is null
    or not private.can_manage_doctor_appointments(requested_clinician_id) then
    raise exception 'Appointment access denied' using errcode = '42501';
  end if;
  if requested_initial_status not in ('pending', 'confirmed') then
    raise exception 'Invalid initial appointment status' using errcode = '23514';
  end if;
  if normalized_name is null or requested_scheduled_end <= requested_scheduled_start
    or requested_scheduled_start < now() - interval '5 minutes' then
    raise exception 'Invalid appointment details' using errcode = '22023';
  end if;
  if requested_patient_id is not null and not exists (
    select 1 from public.patient_access_grants grant_row
    where grant_row.patient_id = requested_patient_id
      and grant_row.clinician_id = requested_clinician_id
      and grant_row.status = 'active' and grant_row.can_view
      and (grant_row.expires_at is null or grant_row.expires_at > now())
  ) then
    raise exception 'Patient access denied' using errcode = '42501';
  end if;
  if requested_initial_status = 'confirmed' then
    perform private.assert_appointment_slot_available(
      requested_clinician_id, requested_scheduled_start,
      requested_scheduled_end, null
    );
  end if;

  insert into public.appointments (
    clinician_id, patient_id, patient_name, patient_phone, patient_email,
    source, status, scheduled_start, scheduled_end, locale, operational_note,
    created_by_auth_user_id, created_by_clinician_id, created_by_staff_id,
    status_changed_by_clinician_id, status_changed_by_staff_id
  ) values (
    requested_clinician_id, requested_patient_id, normalized_name,
    normalized_phone, nullif(lower(btrim(requested_patient_email)), ''),
    requested_source, requested_initial_status, requested_scheduled_start,
    requested_scheduled_end, requested_locale,
    nullif(btrim(requested_operational_note), ''), auth.uid(),
    actor.clinician_id, actor.staff_id, actor.clinician_id, actor.staff_id
  ) returning id into appointment_id;

  if requested_initial_status = 'confirmed' then
    perform private.queue_appointment_notifications(appointment_id, true);
  end if;

  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, actor_staff_id, action,
    patient_id, resource_type, resource_id, correlation_id, safe_metadata
  ) values (
    auth.uid(), actor.clinician_id, actor.staff_id, 'appointment_created',
    requested_patient_id, 'appointment', appointment_id,
    request_correlation_id,
    jsonb_build_object('status', requested_initial_status, 'source', requested_source)
  );
  return appointment_id;
end;
$$;

create function public.transition_managed_appointment(
  requested_appointment_id uuid,
  requested_status public.appointment_status,
  requested_scheduled_start timestamptz,
  requested_scheduled_end timestamptz,
  request_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  appointment public.appointments%rowtype;
  next_start timestamptz;
  next_end timestamptz;
begin
  select * into actor from private.current_appointment_actor();
  select * into appointment from public.appointments
  where id = requested_appointment_id for update;
  if appointment.id is null or auth.uid() is null
    or not private.can_manage_doctor_appointments(appointment.clinician_id) then
    raise exception 'Appointment access denied' using errcode = '42501';
  end if;
  if appointment.status in ('cancelled', 'completed', 'no_show') then
    raise exception 'A final appointment cannot be reopened' using errcode = '23514';
  end if;
  if not (
    (appointment.status = 'pending' and requested_status in ('confirmed', 'cancelled'))
    or (appointment.status in ('confirmed', 'rescheduled')
      and requested_status in ('rescheduled', 'cancelled', 'completed', 'no_show'))
  ) then
    raise exception 'Invalid appointment status transition' using errcode = '23514';
  end if;

  next_start := coalesce(requested_scheduled_start, appointment.scheduled_start);
  next_end := coalesce(requested_scheduled_end, appointment.scheduled_end);
  if requested_status = 'rescheduled'
    and (requested_scheduled_start is null or requested_scheduled_end is null) then
    raise exception 'A rescheduled appointment requires a new time'
      using errcode = '22023';
  end if;
  if requested_status in ('confirmed', 'rescheduled') then
    perform private.assert_appointment_slot_available(
      appointment.clinician_id, next_start, next_end, appointment.id
    );
  end if;

  update public.appointments set
    status = requested_status,
    scheduled_start = next_start,
    scheduled_end = next_end,
    status_changed_by_clinician_id = actor.clinician_id,
    status_changed_by_staff_id = actor.staff_id,
    status_changed_at = now(),
    cancelled_at = case when requested_status = 'cancelled' then now() else null end,
    completed_at = case when requested_status = 'completed' then now() else null end
  where id = appointment.id;

  if requested_status = 'confirmed' then
    perform private.queue_appointment_notifications(appointment.id, true);
  elsif requested_status = 'rescheduled' then
    perform private.queue_appointment_notifications(appointment.id, false);
  elsif requested_status = 'cancelled' then
    update public.appointment_notifications set status = 'cancelled'
    where appointment_id = appointment.id and status <> 'sent';
  end if;

  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, actor_staff_id, action,
    patient_id, resource_type, resource_id, correlation_id, safe_metadata
  ) values (
    auth.uid(), actor.clinician_id, actor.staff_id,
    'appointment_status_updated', appointment.patient_id, 'appointment',
    appointment.id, request_correlation_id,
    jsonb_build_object('from_status', appointment.status, 'to_status', requested_status)
  );
end;
$$;

revoke all on function public.create_managed_appointment(
  uuid, uuid, text, text, text, public.appointment_source, timestamptz,
  timestamptz, text, text, public.appointment_status, uuid
) from public, anon;
grant execute on function public.create_managed_appointment(
  uuid, uuid, text, text, text, public.appointment_source, timestamptz,
  timestamptz, text, text, public.appointment_status, uuid
) to authenticated;
revoke all on function public.transition_managed_appointment(
  uuid, public.appointment_status, timestamptz, timestamptz, uuid
) from public, anon;
grant execute on function public.transition_managed_appointment(
  uuid, public.appointment_status, timestamptz, timestamptz, uuid
) to authenticated;

create function public.claim_due_appointment_notifications(
  requested_limit integer default 20,
  requested_appointment_id uuid default null
)
returns table (
  notification_id uuid,
  appointment_id uuid,
  notification_kind public.appointment_notification_kind,
  destination_phone text,
  locale text,
  patient_name text,
  doctor_name text,
  scheduled_start timestamptz,
  timezone text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select notification.id
    from public.appointment_notifications notification
    join public.appointments appointment
      on appointment.id = notification.appointment_id
    where notification.status in ('pending', 'failed')
      and notification.attempt_count < 5
      and notification.scheduled_for <= now()
      and appointment.status in ('confirmed', 'rescheduled')
      and (requested_appointment_id is null
        or appointment.id = requested_appointment_id)
    order by notification.scheduled_for
    for update of notification skip locked
    limit greatest(1, least(requested_limit, 100))
  ),
  updated as (
    update public.appointment_notifications notification set
      status = 'processing',
      attempt_count = notification.attempt_count + 1,
      claimed_at = now()
    from claimed where notification.id = claimed.id
    returning notification.*
  )
  select updated.id, appointment.id, updated.kind, updated.destination_phone,
    updated.locale, appointment.patient_name, clinician.full_name,
    appointment.scheduled_start, appointment.timezone
  from updated
  join public.appointments appointment on appointment.id = updated.appointment_id
  join public.clinicians clinician on clinician.id = appointment.clinician_id;
end;
$$;

create function public.complete_appointment_notification(
  requested_notification_id uuid,
  delivery_succeeded boolean,
  requested_provider_message_id text,
  requested_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.appointment_notifications set
    status = case when delivery_succeeded then 'sent'::public.appointment_notification_status
      else 'failed'::public.appointment_notification_status end,
    provider_message_id = case when delivery_succeeded
      then nullif(requested_provider_message_id, '') else null end,
    last_error_code = case when delivery_succeeded
      then null else left(coalesce(requested_error_code, 'provider_error'), 80) end,
    sent_at = case when delivery_succeeded then now() else null end
  where id = requested_notification_id and status = 'processing';
end;
$$;

revoke all on function public.claim_due_appointment_notifications(integer, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_appointment_notification(
  uuid, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.claim_due_appointment_notifications(integer, uuid)
  to service_role;
grant execute on function public.complete_appointment_notification(
  uuid, boolean, text, text
) to service_role;

revoke all on table public.appointments, public.appointment_notifications
  from public, anon;
grant select on table public.appointments to authenticated;
revoke insert, update, delete, truncate
  on table public.appointments, public.appointment_notifications
  from authenticated;

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
  'staff_assignment_updated', 'billing_profile_updated',
  'appointment_created', 'appointment_status_updated'
));

commit;
