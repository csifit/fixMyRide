begin;

create table public.doctor_availability (
  id uuid primary key default gen_random_uuid(),
  clinician_id uuid not null references public.clinicians(id) on delete restrict,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_duration_minutes smallint not null
    check (slot_duration_minutes in (15, 30, 45)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time),
  unique (clinician_id, weekday)
);

create trigger doctor_availability_updated_at
before update on public.doctor_availability
for each row execute function public.set_updated_at();

create table public.doctor_time_off (
  id uuid primary key default gen_random_uuid(),
  clinician_id uuid not null references public.clinicians(id) on delete restrict,
  unavailable_date date not null,
  start_time time,
  end_time time,
  reason text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and start_time < end_time)
  ),
  unique (clinician_id, unavailable_date, start_time)
);

alter table public.appointments
  add column slot_duration_minutes smallint
  check (slot_duration_minutes in (15, 30, 45));

alter table public.doctor_availability enable row level security;
alter table public.doctor_time_off enable row level security;

create policy doctor_availability_authorized_read
on public.doctor_availability for select to authenticated
using (private.can_manage_doctor_appointments(clinician_id));
create policy doctor_time_off_authorized_read
on public.doctor_time_off for select to authenticated
using (private.can_manage_doctor_appointments(clinician_id));

revoke all on table public.doctor_availability, public.doctor_time_off
  from public, anon, authenticated;
grant select on table public.doctor_availability, public.doctor_time_off
  to authenticated;

create function public.save_my_weekly_availability(
  requested_weekday smallint,
  requested_start_time time,
  requested_end_time time,
  requested_slot_duration_minutes smallint,
  requested_is_active boolean,
  request_correlation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinician_id uuid;
  availability_id uuid;
begin
  select clinician.id into clinician_id
  from public.clinicians clinician
  where clinician.auth_user_id = auth.uid()
    and clinician.verification_status = 'approved';
  if clinician_id is null then
    raise exception 'Availability access denied' using errcode = '42501';
  end if;
  if requested_weekday not between 0 and 6
    or requested_start_time >= requested_end_time
    or requested_slot_duration_minutes not in (15, 30, 45) then
    raise exception 'Invalid availability' using errcode = '22023';
  end if;
  insert into public.doctor_availability (
    clinician_id, weekday, start_time, end_time,
    slot_duration_minutes, is_active
  ) values (
    clinician_id, requested_weekday, requested_start_time, requested_end_time,
    requested_slot_duration_minutes, requested_is_active
  )
  on conflict (clinician_id, weekday) do update set
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    slot_duration_minutes = excluded.slot_duration_minutes,
    is_active = excluded.is_active
  returning id into availability_id;
  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, action, resource_type,
    resource_id, correlation_id, safe_metadata
  ) values (
    auth.uid(), clinician_id, 'availability_updated', 'doctor_availability',
    availability_id, request_correlation_id,
    '{"changed_fields":["weekday","start_time","end_time","slot_duration_minutes","is_active"]}'::jsonb
  );
  return availability_id;
end;
$$;

create function public.create_slotted_appointment(
  requested_clinician_id uuid,
  requested_patient_name text,
  requested_patient_phone text,
  requested_patient_email text,
  requested_source public.appointment_source,
  requested_scheduled_start timestamptz,
  requested_slot_duration_minutes smallint,
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
  local_start timestamp;
  local_date date;
  local_time time;
  weekday smallint;
  availability public.doctor_availability%rowtype;
  appointment_id uuid;
begin
  if auth.uid() is null
    or not private.can_manage_doctor_appointments(requested_clinician_id) then
    raise exception 'Appointment access denied' using errcode = '42501';
  end if;
  if requested_slot_duration_minutes not in (15, 30, 45)
    or requested_patient_email is null
    or requested_patient_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid appointment slot' using errcode = '22023';
  end if;
  local_start := requested_scheduled_start at time zone 'Europe/Bucharest';
  local_date := local_start::date;
  local_time := local_start::time;
  weekday := extract(dow from local_date)::smallint;
  select row_data.* into availability
  from public.doctor_availability row_data
  where row_data.clinician_id = requested_clinician_id
    and row_data.weekday = weekday and row_data.is_active;
  if availability.id is null
    or availability.slot_duration_minutes <> requested_slot_duration_minutes
    or local_time < availability.start_time
    or local_time + make_interval(mins => requested_slot_duration_minutes)
      > availability.end_time
    or mod(
      extract(epoch from (local_time - availability.start_time))::integer / 60,
      requested_slot_duration_minutes
    ) <> 0
    or exists (
      select 1 from public.doctor_time_off off_time
      where off_time.clinician_id = requested_clinician_id
        and off_time.unavailable_date = local_date
        and (
          off_time.start_time is null
          or (
            local_time < off_time.end_time
            and local_time + make_interval(mins => requested_slot_duration_minutes)
              > off_time.start_time
          )
        )
    ) then
    raise exception 'The selected slot is unavailable' using errcode = '23P01';
  end if;
  appointment_id := public.create_managed_appointment(
    requested_clinician_id, null, requested_patient_name,
    requested_patient_phone, requested_patient_email, requested_source,
    requested_scheduled_start,
    requested_scheduled_start + make_interval(mins => requested_slot_duration_minutes),
    requested_locale, requested_operational_note, requested_initial_status,
    request_correlation_id
  );
  update public.appointments set
    slot_duration_minutes = requested_slot_duration_minutes
  where id = appointment_id;
  return appointment_id;
end;
$$;

create function public.reschedule_slotted_appointment(
  requested_appointment_id uuid,
  requested_scheduled_start timestamptz,
  requested_slot_duration_minutes smallint,
  request_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment public.appointments%rowtype;
  local_start timestamp;
  local_date date;
  local_time time;
  weekday smallint;
  availability public.doctor_availability%rowtype;
begin
  select * into appointment from public.appointments
  where id = requested_appointment_id;
  if appointment.id is null or auth.uid() is null
    or not private.can_manage_doctor_appointments(appointment.clinician_id) then
    raise exception 'Appointment access denied' using errcode = '42501';
  end if;
  local_start := requested_scheduled_start at time zone 'Europe/Bucharest';
  local_date := local_start::date;
  local_time := local_start::time;
  weekday := extract(dow from local_date)::smallint;
  select row_data.* into availability
  from public.doctor_availability row_data
  where row_data.clinician_id = appointment.clinician_id
    and row_data.weekday = weekday and row_data.is_active;
  if requested_slot_duration_minutes not in (15, 30, 45)
    or availability.id is null
    or availability.slot_duration_minutes <> requested_slot_duration_minutes
    or local_time < availability.start_time
    or local_time + make_interval(mins => requested_slot_duration_minutes)
      > availability.end_time
    or mod(
      extract(epoch from (local_time - availability.start_time))::integer / 60,
      requested_slot_duration_minutes
    ) <> 0
    or exists (
      select 1 from public.doctor_time_off off_time
      where off_time.clinician_id = appointment.clinician_id
        and off_time.unavailable_date = local_date
        and (
          off_time.start_time is null
          or (
            local_time < off_time.end_time
            and local_time + make_interval(mins => requested_slot_duration_minutes)
              > off_time.start_time
          )
        )
    ) then
    raise exception 'The selected slot is unavailable' using errcode = '23P01';
  end if;
  perform public.transition_managed_appointment(
    requested_appointment_id, 'rescheduled',
    requested_scheduled_start,
    requested_scheduled_start + make_interval(mins => requested_slot_duration_minutes),
    request_correlation_id
  );
  update public.appointments set
    slot_duration_minutes = requested_slot_duration_minutes
  where id = requested_appointment_id;
end;
$$;

revoke all on function public.save_my_weekly_availability(
  smallint, time, time, smallint, boolean, uuid
) from public, anon;
grant execute on function public.save_my_weekly_availability(
  smallint, time, time, smallint, boolean, uuid
) to authenticated;
revoke all on function public.create_slotted_appointment(
  uuid, text, text, text, public.appointment_source, timestamptz, smallint,
  text, text, public.appointment_status, uuid
) from public, anon;
grant execute on function public.create_slotted_appointment(
  uuid, text, text, text, public.appointment_source, timestamptz, smallint,
  text, text, public.appointment_status, uuid
) to authenticated;
revoke all on function public.reschedule_slotted_appointment(
  uuid, timestamptz, smallint, uuid
) from public, anon;
grant execute on function public.reschedule_slotted_appointment(
  uuid, timestamptz, smallint, uuid
) to authenticated;

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
  'appointment_created', 'appointment_status_updated',
  'availability_updated'
));

commit;
