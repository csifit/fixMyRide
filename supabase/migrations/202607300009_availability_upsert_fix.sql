begin;

create or replace function public.save_my_weekly_availability(
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
  resolved_clinician_id uuid;
  availability_id uuid;
begin
  select clinician.id into resolved_clinician_id
  from public.clinicians clinician
  where clinician.auth_user_id = auth.uid()
    and clinician.verification_status = 'approved';
  if resolved_clinician_id is null then
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
    resolved_clinician_id, requested_weekday,
    requested_start_time, requested_end_time,
    requested_slot_duration_minutes, requested_is_active
  )
  on conflict on constraint doctor_availability_clinician_id_weekday_key
  do update set
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    slot_duration_minutes = excluded.slot_duration_minutes,
    is_active = excluded.is_active
  returning id into availability_id;
  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, action, resource_type,
    resource_id, correlation_id, safe_metadata
  ) values (
    auth.uid(), resolved_clinician_id,
    'availability_updated', 'doctor_availability',
    availability_id, request_correlation_id,
    '{"changed_fields":["weekday","start_time","end_time","slot_duration_minutes","is_active"]}'::jsonb
  );
  return availability_id;
end;
$$;

revoke all on function public.save_my_weekly_availability(
  smallint, time, time, smallint, boolean, uuid
) from public, anon;
grant execute on function public.save_my_weekly_availability(
  smallint, time, time, smallint, boolean, uuid
) to authenticated;

commit;
