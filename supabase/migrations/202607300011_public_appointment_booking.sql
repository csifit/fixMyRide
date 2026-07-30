begin;

create table public.public_appointment_requests (
  id uuid primary key default gen_random_uuid(),
  clinician_id uuid not null references public.clinicians(id) on delete restrict,
  patient_name text not null check (char_length(patient_name) between 2 and 160),
  patient_phone text not null check (
    patient_phone ~ '^(07[0-9]{8}|00407[0-9]{8}|\+407[0-9]{8}|7[0-9]{8})$'
  ),
  patient_email text not null check (char_length(patient_email) between 3 and 320),
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  slot_duration_minutes smallint not null check (slot_duration_minutes in (15, 30, 45)),
  locale text not null check (locale in ('en', 'de', 'ro', 'hu')),
  patient_note text check (patient_note is null or char_length(patient_note) <= 500),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  management_token_digest bytea not null unique,
  linked_appointment_id uuid references public.appointments(id) on delete restrict,
  decided_by_auth_user_id uuid references auth.users(id) on delete restrict,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start),
  check (
    (status = 'pending' and linked_appointment_id is null and decided_at is null)
    or (status <> 'pending' and decided_at is not null)
  )
);

create unique index public_appointment_one_pending_slot_idx
on public.public_appointment_requests(clinician_id, scheduled_start)
where status = 'pending';
create index public_appointment_requests_doctor_status_idx
on public.public_appointment_requests(clinician_id, status, scheduled_start);
create trigger public_appointment_requests_updated_at
before update on public.public_appointment_requests
for each row execute function public.set_updated_at();

alter table public.public_appointment_requests enable row level security;
revoke all on table public.public_appointment_requests
from public, anon, authenticated;

create function public.search_public_doctors(requested_search text default null)
returns table (
  clinician_id uuid,
  full_name text,
  specialty text,
  clinic_name text,
  clinic_country text
)
language sql
stable
security definer
set search_path = ''
as $$
  select clinician.id, clinician.full_name, clinician.specialty,
    clinician.clinic_name, clinician.clinic_country::text
  from public.clinicians clinician
  where clinician.verification_status = 'approved'
    and (
      nullif(btrim(requested_search), '') is null
      or clinician.full_name ilike '%' || btrim(requested_search) || '%'
      or clinician.specialty ilike '%' || btrim(requested_search) || '%'
      or clinician.clinic_name ilike '%' || btrim(requested_search) || '%'
      or clinician.clinic_country ilike '%' || btrim(requested_search) || '%'
    )
  order by clinician.full_name
  limit 100
$$;

create function public.get_public_doctor_slots(
  requested_clinician_id uuid,
  requested_date date
)
returns table (
  scheduled_start timestamptz,
  slot_duration_minutes smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  with schedule as (
    select availability.*
    from public.doctor_availability availability
    join public.clinicians clinician on clinician.id = availability.clinician_id
    where availability.clinician_id = requested_clinician_id
      and clinician.verification_status = 'approved'
      and availability.weekday = extract(dow from requested_date)::smallint
      and availability.is_active
      and requested_date between current_date and current_date + 180
  ),
  generated as (
    select (
      requested_date
      + schedule.start_time
      + make_interval(mins => step.slot_number * schedule.slot_duration_minutes)
    ) at time zone 'Europe/Bucharest' as slot_start,
    schedule.slot_duration_minutes
    from schedule
    cross join lateral generate_series(
      0,
      floor(
        extract(epoch from (schedule.end_time - schedule.start_time))
        / 60 / schedule.slot_duration_minutes
      )::integer - 1
    ) step(slot_number)
  )
  select generated.slot_start, generated.slot_duration_minutes
  from generated
  where generated.slot_start > now()
    and not exists (
      select 1 from public.doctor_time_off off_time
      where off_time.clinician_id = requested_clinician_id
        and off_time.unavailable_date = requested_date
        and (
          off_time.start_time is null
          or (
            (generated.slot_start at time zone 'Europe/Bucharest')::time
              < off_time.end_time
            and (generated.slot_start at time zone 'Europe/Bucharest')::time
              + make_interval(mins => generated.slot_duration_minutes)
              > off_time.start_time
          )
        )
    )
    and not exists (
      select 1 from public.appointments appointment
      where appointment.clinician_id = requested_clinician_id
        and appointment.status in ('confirmed', 'rescheduled')
        and tstzrange(appointment.scheduled_start, appointment.scheduled_end, '[)')
          && tstzrange(
            generated.slot_start,
            generated.slot_start + make_interval(mins => generated.slot_duration_minutes),
            '[)'
          )
    )
    and not exists (
      select 1 from public.public_appointment_requests request
      where request.clinician_id = requested_clinician_id
        and request.status = 'pending'
        and request.scheduled_start = generated.slot_start
    )
  order by generated.slot_start
$$;

create function public.create_public_appointment_request(
  requested_clinician_id uuid,
  requested_patient_name text,
  requested_patient_phone text,
  requested_patient_email text,
  requested_scheduled_start timestamptz,
  requested_slot_duration_minutes smallint,
  requested_locale text,
  requested_patient_note text,
  requested_management_token_digest bytea
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid;
  local_date date;
begin
  local_date := (requested_scheduled_start at time zone 'Europe/Bucharest')::date;
  if nullif(btrim(requested_patient_name), '') is null
    or requested_patient_phone !~ '^(07[0-9]{8}|00407[0-9]{8}|\+407[0-9]{8}|7[0-9]{8})$'
    or requested_patient_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or requested_locale not in ('en', 'de', 'ro', 'hu')
    or requested_management_token_digest is null
    or octet_length(requested_management_token_digest) <> 32
    or not exists (
      select 1 from public.get_public_doctor_slots(
        requested_clinician_id, local_date
      ) slot
      where slot.scheduled_start = requested_scheduled_start
        and slot.slot_duration_minutes = requested_slot_duration_minutes
    ) then
    raise exception 'Invalid or unavailable appointment request'
      using errcode = '22023';
  end if;
  insert into public.public_appointment_requests (
    clinician_id, patient_name, patient_phone, patient_email,
    scheduled_start, scheduled_end, slot_duration_minutes, locale,
    patient_note, management_token_digest
  ) values (
    requested_clinician_id, btrim(requested_patient_name),
    requested_patient_phone, lower(btrim(requested_patient_email)),
    requested_scheduled_start,
    requested_scheduled_start + make_interval(mins => requested_slot_duration_minutes),
    requested_slot_duration_minutes, requested_locale,
    nullif(btrim(requested_patient_note), ''),
    requested_management_token_digest
  )
  returning id into request_id;
  return request_id;
exception
  when unique_violation then
    raise exception 'The selected slot is no longer available'
      using errcode = '23P01';
end;
$$;

create function public.get_public_appointment_request(
  requested_management_token_digest bytea
)
returns table (
  request_id uuid,
  doctor_name text,
  specialty text,
  clinic_name text,
  scheduled_start timestamptz,
  slot_duration_minutes smallint,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select request.id, clinician.full_name, clinician.specialty,
    clinician.clinic_name, request.scheduled_start,
    request.slot_duration_minutes, request.status
  from public.public_appointment_requests request
  join public.clinicians clinician on clinician.id = request.clinician_id
  where request.management_token_digest = requested_management_token_digest
  limit 1
$$;

create function public.load_managed_appointment_requests(
  requested_clinician_ids uuid[]
)
returns table (
  request_id uuid,
  clinician_id uuid,
  patient_name text,
  patient_phone text,
  patient_email text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  slot_duration_minutes smallint,
  locale text,
  patient_note text,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select request.id, request.clinician_id, request.patient_name,
    request.patient_phone, request.patient_email, request.scheduled_start,
    request.scheduled_end, request.slot_duration_minutes, request.locale,
    request.patient_note, request.status
  from public.public_appointment_requests request
  where request.clinician_id = any(requested_clinician_ids)
    and private.can_manage_doctor_appointments(request.clinician_id)
  order by request.scheduled_start
$$;

create function public.decide_public_appointment_request(
  requested_request_id uuid,
  requested_decision text,
  request_correlation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_request public.public_appointment_requests%rowtype;
  appointment_id uuid;
begin
  select request.* into booking_request
  from public.public_appointment_requests request
  where request.id = requested_request_id
  for update;
  if auth.uid() is null or booking_request.id is null
    or not private.can_manage_doctor_appointments(booking_request.clinician_id) then
    raise exception 'Appointment request access denied' using errcode = '42501';
  end if;
  if booking_request.status <> 'pending'
    or requested_decision not in ('confirmed', 'declined') then
    raise exception 'Appointment request already decided' using errcode = '23514';
  end if;
  if requested_decision = 'confirmed' then
    appointment_id := public.create_managed_appointment(
      booking_request.clinician_id, null, booking_request.patient_name,
      booking_request.patient_phone, booking_request.patient_email,
      'online', booking_request.scheduled_start, booking_request.scheduled_end,
      booking_request.locale, booking_request.patient_note, 'confirmed',
      request_correlation_id
    );
    update public.appointments set
      slot_duration_minutes = booking_request.slot_duration_minutes
    where id = appointment_id;
  end if;
  update public.public_appointment_requests set
    status = requested_decision,
    linked_appointment_id = appointment_id,
    decided_by_auth_user_id = auth.uid(),
    decided_at = now()
  where id = booking_request.id;
  return appointment_id;
end;
$$;

revoke all on function public.search_public_doctors(text) from public;
revoke all on function public.get_public_doctor_slots(uuid, date) from public;
revoke all on function public.create_public_appointment_request(
  uuid, text, text, text, timestamptz, smallint, text, text, bytea
) from public;
revoke all on function public.get_public_appointment_request(bytea) from public;
revoke all on function public.load_managed_appointment_requests(uuid[]) from public;
revoke all on function public.decide_public_appointment_request(
  uuid, text, uuid
) from public;

grant execute on function public.search_public_doctors(text) to anon, authenticated;
grant execute on function public.get_public_doctor_slots(uuid, date) to anon, authenticated;
grant execute on function public.create_public_appointment_request(
  uuid, text, text, text, timestamptz, smallint, text, text, bytea
) to anon, authenticated;
grant execute on function public.get_public_appointment_request(bytea) to anon, authenticated;
grant execute on function public.load_managed_appointment_requests(uuid[]) to authenticated;
grant execute on function public.decide_public_appointment_request(
  uuid, text, uuid
) to authenticated;

commit;
