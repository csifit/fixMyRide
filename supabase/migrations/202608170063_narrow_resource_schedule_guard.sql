begin;

create or replace function private.enforce_service_booking_resource_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare assigned_resource_ids uuid[];
begin
  if new.status in ('confirmed', 'checked_in', 'diagnosing', 'awaiting_approval', 'in_service')
    and new.confirmed_start is not null
    and (
      tg_op = 'INSERT'
      or new.confirmed_start is distinct from old.confirmed_start
      or new.duration_minutes is distinct from old.duration_minutes
      or (
        old.status not in ('confirmed', 'checked_in', 'diagnosing', 'awaiting_approval', 'in_service')
        and new.status in ('confirmed', 'checked_in', 'diagnosing', 'awaiting_approval', 'in_service')
      )
    ) then
    select coalesce(array_agg(assignment.resource_id), '{}'::uuid[])
      into assigned_resource_ids
    from public.service_booking_resource_assignments assignment
    where assignment.booking_request_id = new.id;
    perform private.assert_service_booking_resources_available(
      new.id, new.workshop_id, new.confirmed_start, new.duration_minutes,
      assigned_resource_ids
    );
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_service_booking_resource_schedule()
  from public, anon, authenticated;

comment on function private.enforce_service_booking_resource_schedule() is
  'Validates initial confirmation and schedule changes without blocking lifecycle-only repair transitions.';

commit;
