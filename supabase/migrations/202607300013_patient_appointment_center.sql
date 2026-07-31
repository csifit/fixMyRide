begin;

alter table public.public_appointment_requests
  add column patient_id uuid references public.patients(id) on delete restrict;

create index public_appointment_requests_patient_start_idx
on public.public_appointment_requests(patient_id, scheduled_start desc)
where patient_id is not null;

create function private.current_patient_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select patient.id
  from public.patients patient
  where patient.auth_user_id = (select auth.uid())
    and patient.archived_at is null
  limit 1
$$;

revoke all on function private.current_patient_id()
from public, anon, authenticated;

create function public.link_my_appointment_history()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_patient uuid := private.current_patient_id();
  verified_email text := lower(nullif(auth.jwt()->>'email', ''));
  linked_count integer := 0;
  affected integer := 0;
begin
  if auth.uid() is null or current_patient is null or verified_email is null then
    raise exception 'Patient appointment access denied' using errcode = '42501';
  end if;

  update public.public_appointment_requests request set
    patient_id = current_patient
  where request.patient_id is null
    and lower(request.patient_email) = verified_email;
  get diagnostics linked_count = row_count;

  update public.appointments appointment set
    patient_id = current_patient
  where appointment.patient_id is null
    and lower(appointment.patient_email) = verified_email;
  get diagnostics affected = row_count;
  linked_count := linked_count + affected;

  insert into public.public_appointment_requests (
    clinician_id, patient_id, patient_name, patient_phone, patient_email,
    scheduled_start, scheduled_end, slot_duration_minutes, locale,
    status, management_token_digest, linked_appointment_id,
    decided_by_auth_user_id, decided_at
  )
  select appointment.clinician_id, current_patient, appointment.patient_name,
    appointment.patient_phone, appointment.patient_email,
    appointment.scheduled_start, appointment.scheduled_end,
    appointment.slot_duration_minutes, appointment.locale,
    'confirmed',
    digest(gen_random_uuid()::text, 'sha256'),
    appointment.id, appointment.created_by_auth_user_id,
    appointment.status_changed_at
  from public.appointments appointment
  where appointment.patient_id = current_patient
    and appointment.patient_email is not null
    and appointment.slot_duration_minutes is not null
    and appointment.status in ('confirmed', 'rescheduled')
    and not exists (
      select 1 from public.public_appointment_requests request
      where request.linked_appointment_id = appointment.id
    );
  get diagnostics affected = row_count;

  return linked_count + affected;
end;
$$;

create function public.load_my_patient_appointments()
returns table (
  booking_id uuid,
  public_request_id uuid,
  appointment_id uuid,
  clinician_id uuid,
  doctor_name text,
  specialty text,
  clinic_name text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  slot_duration_minutes smallint,
  booking_status text,
  booking_source text,
  change_request_id uuid,
  change_request_type text,
  change_request_status text,
  requested_change_start timestamptz,
  requested_change_duration_minutes smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  with patient_context as (
    select private.current_patient_id() as id
  ),
  public_bookings as (
    select request.id as booking_id, request.id as public_request_id,
      appointment.id as appointment_id, request.clinician_id,
      clinician.full_name as doctor_name, clinician.specialty,
      clinician.clinic_name,
      coalesce(appointment.scheduled_start, request.scheduled_start)
        as scheduled_start,
      coalesce(appointment.scheduled_end, request.scheduled_end)
        as scheduled_end,
      coalesce(appointment.slot_duration_minutes, request.slot_duration_minutes)
        as slot_duration_minutes,
      case
        when request.status <> 'confirmed' then request.status
        when appointment.status in ('confirmed', 'rescheduled') then 'confirmed'
        when appointment.status = 'cancelled' then 'cancelled'
        when appointment.status = 'completed' then 'completed'
        when appointment.status = 'no_show' then 'no_show'
        else request.status
      end as booking_status,
      coalesce(appointment.source::text, 'online') as booking_source,
      change_request.id as change_request_id,
      change_request.request_type as change_request_type,
      change_request.status as change_request_status,
      change_request.requested_start as requested_change_start,
      change_request.requested_slot_duration_minutes
        as requested_change_duration_minutes
    from public.public_appointment_requests request
    join patient_context patient on patient.id = request.patient_id
    join public.clinicians clinician on clinician.id = request.clinician_id
    left join public.appointments appointment
      on appointment.id = request.linked_appointment_id
    left join lateral (
      select change_row.*
      from public.public_appointment_change_requests change_row
      where change_row.public_request_id = request.id
      order by change_row.created_at desc
      limit 1
    ) change_request on true
  ),
  manually_created as (
    select appointment.id as booking_id, null::uuid as public_request_id,
      appointment.id as appointment_id, appointment.clinician_id,
      clinician.full_name as doctor_name, clinician.specialty,
      clinician.clinic_name, appointment.scheduled_start,
      appointment.scheduled_end, appointment.slot_duration_minutes,
      case when appointment.status = 'rescheduled'
        then 'confirmed' else appointment.status::text end as booking_status,
      appointment.source::text as booking_source,
      null::uuid as change_request_id, null::text as change_request_type,
      null::text as change_request_status,
      null::timestamptz as requested_change_start,
      null::smallint as requested_change_duration_minutes
    from public.appointments appointment
    join patient_context patient on patient.id = appointment.patient_id
    join public.clinicians clinician on clinician.id = appointment.clinician_id
    where not exists (
      select 1 from public.public_appointment_requests request
      where request.linked_appointment_id = appointment.id
    )
  )
  select * from public_bookings
  union all
  select * from manually_created
  order by scheduled_start desc
$$;

create function public.cancel_my_pending_appointment_request(
  requested_public_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_patient uuid := private.current_patient_id();
begin
  if auth.uid() is null or current_patient is null then
    raise exception 'Patient appointment access denied' using errcode = '42501';
  end if;
  update public.public_appointment_requests request set
    status = 'cancelled',
    decided_at = now()
  where request.id = requested_public_request_id
    and request.patient_id = current_patient
    and request.status = 'pending';
  if not found then
    raise exception 'Appointment request cannot be cancelled'
      using errcode = '23514';
  end if;
end;
$$;

create function public.create_my_appointment_change_request(
  requested_public_request_id uuid,
  requested_change_type text,
  requested_scheduled_start timestamptz,
  requested_slot_duration_minutes smallint,
  requested_patient_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_patient uuid := private.current_patient_id();
  booking_request public.public_appointment_requests%rowtype;
  appointment public.appointments%rowtype;
  change_request_id uuid;
  local_date date;
begin
  if auth.uid() is null or current_patient is null then
    raise exception 'Patient appointment access denied' using errcode = '42501';
  end if;
  select request.* into booking_request
  from public.public_appointment_requests request
  where request.id = requested_public_request_id
    and request.patient_id = current_patient;
  select appointment_row.* into appointment
  from public.appointments appointment_row
  where appointment_row.id = booking_request.linked_appointment_id;

  if booking_request.id is null or booking_request.status <> 'confirmed'
    or appointment.id is null
    or appointment.status not in ('confirmed', 'rescheduled')
    or appointment.scheduled_start <= now()
    or requested_change_type not in ('cancel', 'reschedule')
    or exists (
      select 1 from public.public_appointment_change_requests existing
      where existing.appointment_id = appointment.id
        and existing.status = 'pending'
    ) then
    raise exception 'Appointment change cannot be requested'
      using errcode = '23514';
  end if;

  if requested_change_type = 'reschedule' then
    local_date := (
      requested_scheduled_start at time zone 'Europe/Bucharest'
    )::date;
    if requested_scheduled_start is null
      or requested_slot_duration_minutes not in (15, 30, 45)
      or not exists (
        select 1 from public.get_public_doctor_slots(
          booking_request.clinician_id, local_date
        ) slot
        where slot.scheduled_start = requested_scheduled_start
          and slot.slot_duration_minutes = requested_slot_duration_minutes
      ) then
      raise exception 'Requested appointment slot is unavailable'
        using errcode = '23P01';
    end if;
  end if;

  insert into public.public_appointment_change_requests (
    public_request_id, appointment_id, clinician_id, request_type,
    requested_start, requested_end, requested_slot_duration_minutes,
    patient_note
  ) values (
    booking_request.id, appointment.id, booking_request.clinician_id,
    requested_change_type,
    case when requested_change_type = 'reschedule'
      then requested_scheduled_start end,
    case when requested_change_type = 'reschedule'
      then requested_scheduled_start
        + make_interval(mins => requested_slot_duration_minutes) end,
    case when requested_change_type = 'reschedule'
      then requested_slot_duration_minutes end,
    nullif(btrim(requested_patient_note), '')
  )
  returning id into change_request_id;
  return change_request_id;
end;
$$;

revoke all on function private.current_patient_id()
from public, anon, authenticated;
revoke all on function public.link_my_appointment_history()
from public, anon;
revoke all on function public.load_my_patient_appointments()
from public, anon;
revoke all on function public.cancel_my_pending_appointment_request(uuid)
from public, anon;
revoke all on function public.create_my_appointment_change_request(
  uuid, text, timestamptz, smallint, text
) from public, anon;

grant execute on function public.link_my_appointment_history()
to authenticated;
grant execute on function public.load_my_patient_appointments()
to authenticated;
grant execute on function public.cancel_my_pending_appointment_request(uuid)
to authenticated;
grant execute on function public.create_my_appointment_change_request(
  uuid, text, timestamptz, smallint, text
) to authenticated;

commit;
