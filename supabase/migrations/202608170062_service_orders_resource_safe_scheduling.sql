begin;

create sequence public.service_order_reference_seq;

alter table public.service_booking_requests
  add column service_order_number text,
  add column service_order_mechanic_override text
    check (service_order_mechanic_override is null or char_length(service_order_mechanic_override) <= 160),
  add column vehicle_reception_condition text
    check (vehicle_reception_condition is null or char_length(vehicle_reception_condition) <= 2000);

create unique index service_booking_requests_service_order_number_idx
  on public.service_booking_requests(service_order_number)
  where service_order_number is not null;

create function private.assign_service_order_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.service_order_number is null and new.status in (
    'confirmed', 'checked_in', 'diagnosing', 'awaiting_approval',
    'in_service', 'ready_for_collection', 'completed', 'no_show'
  ) then
    new.service_order_number := 'SO-' || to_char(coalesce(new.created_at, now()), 'YYYYMMDD')
      || '-' || lpad(nextval('public.service_order_reference_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

revoke all on function private.assign_service_order_number()
  from public, anon, authenticated;

create trigger service_booking_requests_assign_service_order_number
before insert or update of status on public.service_booking_requests
for each row execute function private.assign_service_order_number();

update public.service_booking_requests booking
set service_order_number = 'SO-' || to_char(booking.created_at, 'YYYYMMDD')
  || '-' || lpad(nextval('public.service_order_reference_seq')::text, 6, '0')
where booking.service_order_number is null
  and booking.status in (
    'confirmed', 'checked_in', 'diagnosing', 'awaiting_approval',
    'in_service', 'ready_for_collection', 'completed', 'no_show'
  );

create function private.assert_service_booking_resources_available(
  requested_booking_id uuid,
  requested_workshop_id uuid,
  requested_start timestamptz,
  requested_duration_minutes integer,
  requested_resource_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_end timestamptz;
  candidate_id uuid;
begin
  if requested_start is null or requested_duration_minutes not between 15 and 1440 then
    raise exception 'A valid booking time and duration are required' using errcode = '23514';
  end if;
  requested_end := requested_start + make_interval(mins => requested_duration_minutes);

  for candidate_id in
    select distinct resource_id
    from unnest(coalesce(requested_resource_ids, '{}'::uuid[])) resource_id
    where resource_id is not null
    order by resource_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(candidate_id::text, 0));
    if not exists (
      select 1 from public.workshop_schedule_resources resource
      where resource.id = candidate_id
        and resource.workshop_id = requested_workshop_id
        and resource.active
    ) then
      raise exception 'The selected resource is unavailable' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.workshop_resource_absences absence
      where absence.resource_id = candidate_id
        and tstzrange(absence.starts_at, absence.ends_at, '[)')
          && tstzrange(requested_start, requested_end, '[)')
    ) or exists (
      select 1
      from public.service_booking_resource_assignments assignment
      join public.service_booking_requests other
        on other.id = assignment.booking_request_id
      where assignment.resource_id = candidate_id
        and other.id <> requested_booking_id
        and other.status in (
          'confirmed', 'checked_in', 'diagnosing', 'awaiting_approval', 'in_service'
        )
        and other.confirmed_start is not null
        and tstzrange(
          other.confirmed_start,
          other.confirmed_start + make_interval(mins => other.duration_minutes), '[)'
        ) && tstzrange(requested_start, requested_end, '[)')
    ) then
      raise exception 'The selected resource is already occupied' using errcode = '23P01';
    end if;
  end loop;
end;
$$;

revoke all on function private.assert_service_booking_resources_available(
  uuid, uuid, timestamptz, integer, uuid[]
) from public, anon, authenticated;

create function private.enforce_service_booking_resource_schedule()
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
      or new.status is distinct from old.status
      or new.confirmed_start is distinct from old.confirmed_start
      or new.duration_minutes is distinct from old.duration_minutes
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

create trigger service_booking_requests_resource_schedule_guard
before insert or update of status, confirmed_start, duration_minutes
on public.service_booking_requests
for each row execute function private.enforce_service_booking_resource_schedule();

create or replace function public.update_managed_booking_schedule(
  requested_booking_id uuid,
  requested_start timestamptz,
  requested_duration_minutes integer,
  requested_mechanic_id uuid default null,
  requested_facility_id uuid default null,
  replace_assignments boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_row public.service_booking_requests%rowtype;
  canonical_workshop_id uuid;
  manager_id uuid;
  candidate_kind public.workshop_resource_kind;
  resource_ids uuid[];
  old_start timestamptz;
begin
  select booking.* into booking_row
  from public.service_booking_requests booking
  where booking.id = requested_booking_id for update;
  select workshop.id into canonical_workshop_id
  from public.workshops workshop where workshop.id = booking_row.workshop_id;
  if booking_row.id is null or not private.can_manage_automotive_workshop(canonical_workshop_id) then
    raise exception 'Booking is unavailable' using errcode = '42501';
  end if;
  if booking_row.status not in ('confirmed', 'checked_in', 'diagnosing', 'awaiting_approval', 'in_service') then
    raise exception 'This booking cannot be scheduled' using errcode = '23514';
  end if;

  if replace_assignments then
    if requested_mechanic_id is not null then
      select resource.kind into candidate_kind
      from public.workshop_schedule_resources resource
      where resource.id = requested_mechanic_id
        and resource.workshop_id = canonical_workshop_id and resource.active;
      if candidate_kind is distinct from 'mechanic'::public.workshop_resource_kind then
        raise exception 'The selected mechanic is unavailable' using errcode = '23514';
      end if;
    end if;
    if requested_facility_id is not null then
      candidate_kind := null;
      select resource.kind into candidate_kind
      from public.workshop_schedule_resources resource
      where resource.id = requested_facility_id
        and resource.workshop_id = canonical_workshop_id and resource.active;
      if candidate_kind is null or candidate_kind not in ('bay', 'ramp') then
        raise exception 'The selected station is unavailable' using errcode = '23514';
      end if;
    end if;
    resource_ids := array_remove(array[requested_mechanic_id, requested_facility_id], null);
  else
    select coalesce(array_agg(assignment.resource_id), '{}'::uuid[])
      into resource_ids
    from public.service_booking_resource_assignments assignment
    where assignment.booking_request_id = requested_booking_id;
  end if;

  perform private.assert_service_booking_resources_available(
    requested_booking_id, canonical_workshop_id, requested_start,
    requested_duration_minutes, resource_ids
  );

  old_start := booking_row.confirmed_start;
  if replace_assignments then
    delete from public.service_booking_resource_assignments
    where booking_request_id = requested_booking_id;
    if requested_mechanic_id is not null then
      insert into public.service_booking_resource_assignments
        (booking_request_id, resource_id)
      values (requested_booking_id, requested_mechanic_id);
    end if;
    if requested_facility_id is not null then
      insert into public.service_booking_resource_assignments
        (booking_request_id, resource_id)
      values (requested_booking_id, requested_facility_id);
    end if;
  end if;

  update public.service_booking_requests set confirmed_start = requested_start,
    duration_minutes = requested_duration_minutes, status_changed_at = case
      when confirmed_start is distinct from requested_start then now() else status_changed_at end
  where id = requested_booking_id;

  if old_start is distinct from requested_start then
    select manager.id into manager_id from public.workshop_manager_profiles manager
    where manager.auth_user_id = (select auth.uid()) and manager.status = 'active';
    insert into public.service_booking_request_history(
      booking_request_id, action, previous_status, new_status,
      previous_confirmed_start, new_confirmed_start, actor_workshop_manager_id
    ) values (requested_booking_id, 'rescheduled', booking_row.status, booking_row.status,
      old_start, requested_start, manager_id);
  end if;
end;
$$;

create function public.get_my_service_order_fields()
returns table (
  booking_id uuid,
  service_order_number text,
  mechanic_override text,
  reception_condition text,
  resources jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select booking.id, booking.service_order_number,
    booking.service_order_mechanic_override, booking.vehicle_reception_condition,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', resource.id, 'kind', resource.kind, 'name', resource.display_name
      ) order by resource.kind, resource.display_name)
      from public.service_booking_resource_assignments assignment
      join public.workshop_schedule_resources resource
        on resource.id = assignment.resource_id
      where assignment.booking_request_id = booking.id
    ), '[]'::jsonb)
  from public.service_booking_requests booking
  where private.can_manage_automotive_workshop(booking.workshop_id)
    and booking.status in (
      'confirmed', 'checked_in', 'diagnosing', 'awaiting_approval',
      'in_service', 'ready_for_collection', 'completed', 'no_show'
    )
$$;

revoke all on function public.get_my_service_order_fields()
  from public, anon, authenticated;
grant execute on function public.get_my_service_order_fields()
  to authenticated;

create function public.update_managed_service_order_details(
  requested_booking_id uuid,
  requested_mechanic_override text,
  requested_reception_condition text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare booking_row public.service_booking_requests%rowtype;
begin
  select booking.* into booking_row
  from public.service_booking_requests booking
  where booking.id = requested_booking_id for update;
  if booking_row.id is null
    or not private.can_manage_automotive_workshop(booking_row.workshop_id) then
    raise exception 'Service order is unavailable' using errcode = '42501';
  end if;
  if booking_row.status not in (
    'confirmed', 'checked_in', 'diagnosing', 'awaiting_approval',
    'in_service', 'ready_for_collection'
  ) then
    raise exception 'This service order can no longer be edited' using errcode = '23514';
  end if;
  update public.service_booking_requests set
    service_order_mechanic_override = nullif(btrim(requested_mechanic_override), ''),
    vehicle_reception_condition = nullif(btrim(requested_reception_condition), '')
  where id = requested_booking_id;
end;
$$;

revoke all on function public.update_managed_service_order_details(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.update_managed_service_order_details(uuid, text, text)
  to authenticated;

create function public.get_managed_service_order(requested_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not exists (
    select 1 from public.service_booking_requests booking
    where booking.id = requested_booking_id
      and private.can_manage_automotive_workshop(booking.workshop_id)
  ) then
    raise exception 'Service order is unavailable' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'bookingId', booking.id,
    'orderNumber', booking.service_order_number,
    'status', booking.status,
    'createdAt', booking.created_at,
    'confirmedStart', booking.confirmed_start,
    'durationMinutes', booking.duration_minutes,
    'workshop', jsonb_build_object(
      'name', workshop.display_name, 'organisation', provider.display_name,
      'address', workshop.address, 'city', workshop.city,
      'phone', workshop.public_phone, 'email', workshop.public_email
    ),
    'customer', jsonb_build_object(
      'name', booking.customer_name, 'phone', booking.customer_phone,
      'email', booking.customer_email
    ),
    'vehicle', jsonb_build_object(
      'registration', booking.vehicle_registration, 'make', booking.vehicle_make,
      'model', booking.vehicle_model, 'year', booking.vehicle_year,
      'vin', booking.vehicle_vin, 'mileageKm', booking.mileage_km
    ),
    'serviceName', service.name,
    'customerNote', booking.customer_note,
    'workshopNote', booking.workshop_note,
    'mechanicOverride', booking.service_order_mechanic_override,
    'receptionCondition', booking.vehicle_reception_condition,
    'resources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', resource.kind, 'name', resource.display_name
      ) order by resource.kind, resource.display_name)
      from public.service_booking_resource_assignments assignment
      join public.workshop_schedule_resources resource
        on resource.id = assignment.resource_id
      where assignment.booking_request_id = booking.id
    ), '[]'::jsonb),
    'estimate', (
      select jsonb_build_object(
        'status', estimate.status, 'diagnosis', estimate.diagnosis_summary,
        'currency', estimate.currency, 'totalCents', estimate.total_cents,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'type', item.item_type, 'description', item.description,
            'quantity', item.quantity, 'lineTotalCents', item.line_total_cents
          ) order by item.display_order)
          from public.repair_estimate_items item where item.estimate_id = estimate.id
        ), '[]'::jsonb)
      )
      from public.repair_estimates estimate
      where estimate.booking_request_id = booking.id
      order by estimate.version desc limit 1
    ),
    'serviceRecord', (
      select jsonb_build_object(
        'workSummary', record.work_summary,
        'inspectionSummary', record.inspection_summary,
        'parts', coalesce((
          select jsonb_agg(jsonb_build_object(
            'description', part.description, 'partNumber', part.part_number,
            'quantity', part.quantity, 'warrantyExpiresOn', part.warranty_expires_on
          ) order by part.display_order)
          from public.vehicle_service_record_parts part
          where part.service_record_id = record.id
        ), '[]'::jsonb),
        'recommendations', coalesce((
          select jsonb_agg(jsonb_build_object(
            'description', recommendation.description,
            'dueOn', recommendation.due_on,
            'dueMileageKm', recommendation.due_mileage_km
          ) order by recommendation.display_order)
          from public.vehicle_maintenance_recommendations recommendation
          where recommendation.service_record_id = record.id
        ), '[]'::jsonb)
      )
      from public.vehicle_service_records record
      where record.booking_request_id = booking.id
    )
  ) into result
  from public.service_booking_requests booking
  join public.workshops workshop on workshop.id = booking.workshop_id
  join public.service_providers provider on provider.id = workshop.service_provider_id
  join public.workshop_services service
    on service.id = booking.service_id and service.workshop_id = booking.workshop_id
  where booking.id = requested_booking_id;
  return result;
end;
$$;

revoke all on function public.get_managed_service_order(uuid)
  from public, anon, authenticated;
grant execute on function public.get_managed_service_order(uuid)
  to authenticated;

comment on column public.service_booking_requests.service_order_number is
  'Stable human-readable reference for the internal workshop service order.';
comment on column public.service_booking_requests.service_order_mechanic_override is
  'Optional printable mechanic name; structured calendar resource assignments remain authoritative.';

commit;
