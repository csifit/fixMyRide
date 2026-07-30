begin;

create or replace function public.create_slotted_appointment(
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
  local_weekday smallint;
  availability public.doctor_availability%rowtype;
  created_appointment_id uuid;
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
  local_weekday := extract(dow from local_date)::smallint;
  select row_data.* into availability
  from public.doctor_availability row_data
  where row_data.clinician_id = requested_clinician_id
    and row_data.weekday = local_weekday
    and row_data.is_active;
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
  created_appointment_id := public.create_managed_appointment(
    requested_clinician_id, null, requested_patient_name,
    requested_patient_phone, requested_patient_email, requested_source,
    requested_scheduled_start,
    requested_scheduled_start + make_interval(mins => requested_slot_duration_minutes),
    requested_locale, requested_operational_note, requested_initial_status,
    request_correlation_id
  );
  update public.appointments set
    slot_duration_minutes = requested_slot_duration_minutes
  where id = created_appointment_id;
  return created_appointment_id;
end;
$$;

create or replace function public.reschedule_slotted_appointment(
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
  current_appointment public.appointments%rowtype;
  local_start timestamp;
  local_date date;
  local_time time;
  local_weekday smallint;
  availability public.doctor_availability%rowtype;
begin
  select appointment_row.* into current_appointment
  from public.appointments appointment_row
  where appointment_row.id = requested_appointment_id;
  if current_appointment.id is null or auth.uid() is null
    or not private.can_manage_doctor_appointments(current_appointment.clinician_id) then
    raise exception 'Appointment access denied' using errcode = '42501';
  end if;
  local_start := requested_scheduled_start at time zone 'Europe/Bucharest';
  local_date := local_start::date;
  local_time := local_start::time;
  local_weekday := extract(dow from local_date)::smallint;
  select row_data.* into availability
  from public.doctor_availability row_data
  where row_data.clinician_id = current_appointment.clinician_id
    and row_data.weekday = local_weekday
    and row_data.is_active;
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
      where off_time.clinician_id = current_appointment.clinician_id
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

commit;
