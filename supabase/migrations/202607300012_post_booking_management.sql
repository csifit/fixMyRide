begin;

create table public.public_appointment_change_requests (
  id uuid primary key default gen_random_uuid(),
  public_request_id uuid not null
    references public.public_appointment_requests(id) on delete restrict,
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  clinician_id uuid not null references public.clinicians(id) on delete restrict,
  request_type text not null check (request_type in ('cancel', 'reschedule')),
  requested_start timestamptz,
  requested_end timestamptz,
  requested_slot_duration_minutes smallint
    check (requested_slot_duration_minutes in (15, 30, 45)),
  patient_note text check (patient_note is null or char_length(patient_note) <= 500),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  decided_by_auth_user_id uuid references auth.users(id) on delete restrict,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (request_type = 'cancel' and requested_start is null
      and requested_end is null and requested_slot_duration_minutes is null)
    or
    (request_type = 'reschedule' and requested_start is not null
      and requested_end is not null and requested_slot_duration_minutes is not null
      and requested_end > requested_start)
  ),
  check (
    (status = 'pending' and decided_at is null)
    or (status <> 'pending' and decided_at is not null)
  )
);

create unique index public_appointment_one_pending_change_idx
on public.public_appointment_change_requests(appointment_id)
where status = 'pending';
create index public_appointment_change_doctor_status_idx
on public.public_appointment_change_requests(clinician_id, status, created_at);
create trigger public_appointment_change_requests_updated_at
before update on public.public_appointment_change_requests
for each row execute function public.set_updated_at();

alter table public.public_appointment_change_requests enable row level security;
revoke all on table public.public_appointment_change_requests
from public, anon, authenticated;

create function public.get_public_appointment_management(
  requested_management_token_digest bytea
)
returns table (
  request_id uuid,
  clinician_id uuid,
  doctor_name text,
  specialty text,
  clinic_name text,
  scheduled_start timestamptz,
  slot_duration_minutes smallint,
  booking_status text,
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
  select request.id, request.clinician_id, clinician.full_name,
    clinician.specialty, clinician.clinic_name,
    coalesce(appointment.scheduled_start, request.scheduled_start),
    coalesce(appointment.slot_duration_minutes, request.slot_duration_minutes),
    case
      when request.status <> 'confirmed' then request.status
      when appointment.status in ('confirmed', 'rescheduled') then 'confirmed'
      when appointment.status = 'cancelled' then 'cancelled'
      when appointment.status = 'completed' then 'completed'
      when appointment.status = 'no_show' then 'no_show'
      else request.status
    end,
    change_request.id, change_request.request_type, change_request.status,
    change_request.requested_start,
    change_request.requested_slot_duration_minutes
  from public.public_appointment_requests request
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
  where request.management_token_digest = requested_management_token_digest
  limit 1
$$;

create function public.cancel_pending_public_appointment_request(
  requested_management_token_digest bytea
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.public_appointment_requests request set
    status = 'cancelled',
    decided_at = now()
  where request.management_token_digest = requested_management_token_digest
    and request.status = 'pending';
  if not found then
    raise exception 'Appointment request cannot be cancelled'
      using errcode = '23514';
  end if;
end;
$$;

create function public.create_public_appointment_change_request(
  requested_management_token_digest bytea,
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
  booking_request public.public_appointment_requests%rowtype;
  appointment public.appointments%rowtype;
  change_request_id uuid;
  local_date date;
begin
  select request.* into booking_request
  from public.public_appointment_requests request
  where request.management_token_digest = requested_management_token_digest;
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

create function public.load_managed_appointment_change_requests(
  requested_clinician_ids uuid[]
)
returns table (
  change_request_id uuid,
  public_request_id uuid,
  appointment_id uuid,
  clinician_id uuid,
  patient_name text,
  patient_phone text,
  patient_email text,
  locale text,
  request_type text,
  current_start timestamptz,
  requested_start timestamptz,
  requested_slot_duration_minutes smallint,
  patient_note text,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select change_request.id, change_request.public_request_id,
    change_request.appointment_id, change_request.clinician_id,
    public_request.patient_name, public_request.patient_phone,
    public_request.patient_email, public_request.locale,
    change_request.request_type, appointment.scheduled_start,
    change_request.requested_start,
    change_request.requested_slot_duration_minutes,
    change_request.patient_note, change_request.status
  from public.public_appointment_change_requests change_request
  join public.public_appointment_requests public_request
    on public_request.id = change_request.public_request_id
  join public.appointments appointment
    on appointment.id = change_request.appointment_id
  where change_request.clinician_id = any(requested_clinician_ids)
    and private.can_manage_doctor_appointments(change_request.clinician_id)
  order by change_request.created_at desc
$$;

create function public.get_managed_public_appointment_request(
  requested_request_id uuid
)
returns table (
  request_id uuid,
  clinician_id uuid,
  patient_name text,
  patient_email text,
  locale text,
  doctor_name text,
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
  select request.id, request.clinician_id, request.patient_name,
    request.patient_email, request.locale, clinician.full_name,
    clinician.clinic_name, request.scheduled_start,
    request.slot_duration_minutes, request.status
  from public.public_appointment_requests request
  join public.clinicians clinician on clinician.id = request.clinician_id
  where request.id = requested_request_id
    and private.can_manage_doctor_appointments(request.clinician_id)
  limit 1
$$;

create function public.get_managed_public_appointment_change_request(
  requested_change_request_id uuid
)
returns table (
  change_request_id uuid,
  clinician_id uuid,
  patient_name text,
  patient_email text,
  locale text,
  doctor_name text,
  clinic_name text,
  request_type text,
  current_start timestamptz,
  requested_start timestamptz,
  requested_slot_duration_minutes smallint,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select change_request.id, change_request.clinician_id,
    public_request.patient_name, public_request.patient_email,
    public_request.locale, clinician.full_name, clinician.clinic_name,
    change_request.request_type, appointment.scheduled_start,
    change_request.requested_start,
    change_request.requested_slot_duration_minutes,
    change_request.status
  from public.public_appointment_change_requests change_request
  join public.public_appointment_requests public_request
    on public_request.id = change_request.public_request_id
  join public.appointments appointment
    on appointment.id = change_request.appointment_id
  join public.clinicians clinician
    on clinician.id = change_request.clinician_id
  where change_request.id = requested_change_request_id
    and private.can_manage_doctor_appointments(change_request.clinician_id)
  limit 1
$$;

create function public.decide_public_appointment_change_request(
  requested_change_request_id uuid,
  requested_decision text,
  request_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  change_request public.public_appointment_change_requests%rowtype;
begin
  select request.* into change_request
  from public.public_appointment_change_requests request
  where request.id = requested_change_request_id
  for update;
  if auth.uid() is null or change_request.id is null
    or not private.can_manage_doctor_appointments(change_request.clinician_id) then
    raise exception 'Appointment change access denied' using errcode = '42501';
  end if;
  if change_request.status <> 'pending'
    or requested_decision not in ('approved', 'declined') then
    raise exception 'Appointment change already decided' using errcode = '23514';
  end if;
  if requested_decision = 'approved' then
    if change_request.request_type = 'cancel' then
      perform public.transition_managed_appointment(
        change_request.appointment_id, 'cancelled', null, null,
        request_correlation_id
      );
    else
      perform public.reschedule_slotted_appointment(
        change_request.appointment_id, change_request.requested_start,
        change_request.requested_slot_duration_minutes,
        request_correlation_id
      );
    end if;
  end if;
  update public.public_appointment_change_requests set
    status = requested_decision,
    decided_by_auth_user_id = auth.uid(),
    decided_at = now()
  where id = change_request.id;
end;
$$;

revoke all on function public.get_public_appointment_management(bytea) from public;
revoke all on function public.cancel_pending_public_appointment_request(bytea) from public;
revoke all on function public.create_public_appointment_change_request(
  bytea, text, timestamptz, smallint, text
) from public;
revoke all on function public.load_managed_appointment_change_requests(uuid[]) from public;
revoke all on function public.get_managed_public_appointment_request(uuid) from public;
revoke all on function public.get_managed_public_appointment_change_request(uuid) from public;
revoke all on function public.decide_public_appointment_change_request(
  uuid, text, uuid
) from public;

grant execute on function public.get_public_appointment_management(bytea)
to anon, authenticated;
grant execute on function public.cancel_pending_public_appointment_request(bytea)
to anon, authenticated;
grant execute on function public.create_public_appointment_change_request(
  bytea, text, timestamptz, smallint, text
) to anon, authenticated;
grant execute on function public.load_managed_appointment_change_requests(uuid[])
to authenticated;
grant execute on function public.get_managed_public_appointment_request(uuid)
to authenticated;
grant execute on function public.get_managed_public_appointment_change_request(uuid)
to authenticated;
grant execute on function public.decide_public_appointment_change_request(
  uuid, text, uuid
) to authenticated;

commit;
