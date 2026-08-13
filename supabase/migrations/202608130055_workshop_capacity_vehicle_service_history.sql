begin;

create type public.workshop_resource_kind as enum ('mechanic', 'bay', 'ramp');

create table public.workshop_schedule_resources (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  kind public.workshop_resource_kind not null,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, kind, display_name)
);

create table public.workshop_resource_absences (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.workshop_schedule_resources(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text check (reason is null or char_length(reason) <= 240),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.service_booking_resource_assignments (
  booking_request_id uuid not null references public.service_booking_requests(id) on delete cascade,
  resource_id uuid not null references public.workshop_schedule_resources(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  primary key (booking_request_id, resource_id)
);

create index workshop_resource_absences_time_idx
  on public.workshop_resource_absences(resource_id, starts_at, ends_at);
create index service_booking_resource_assignments_resource_idx
  on public.service_booking_resource_assignments(resource_id, booking_request_id);

create trigger workshop_schedule_resources_updated_at
before update on public.workshop_schedule_resources
for each row execute function public.set_updated_at();

alter table public.workshop_schedule_resources enable row level security;
alter table public.workshop_resource_absences enable row level security;
alter table public.service_booking_resource_assignments enable row level security;
revoke all on table public.workshop_schedule_resources,
  public.workshop_resource_absences, public.service_booking_resource_assignments
  from public, anon, authenticated;

create function public.get_my_workshop_schedule_resources()
returns table (
  workshop_id uuid, workshop_name text, daily_capacity integer,
  resource_id uuid, resource_kind public.workshop_resource_kind,
  resource_name text, resource_active boolean, absences jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select workshop.id, workshop.display_name, workshop.daily_booking_capacity,
    resource.id, resource.kind, resource.display_name, resource.active,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', absence.id, 'startsAt', absence.starts_at,
        'endsAt', absence.ends_at, 'reason', absence.reason
      ) order by absence.starts_at)
      from public.workshop_resource_absences absence
      where absence.resource_id = resource.id and absence.ends_at > now() - interval '30 days'
    ), '[]'::jsonb)
  from public.workshops workshop
  left join public.workshop_schedule_resources resource
    on resource.workshop_id = workshop.id
  where private.can_manage_automotive_workshop(workshop.id)
  order by workshop.display_name, resource.kind, resource.display_name
$$;

revoke all on function public.get_my_workshop_schedule_resources()
  from public, anon, authenticated;
grant execute on function public.get_my_workshop_schedule_resources()
  to authenticated;

create function public.get_my_service_booking_resource_assignments()
returns table (booking_id uuid, resources jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select booking.id,
    coalesce(jsonb_agg(jsonb_build_object(
      'id', resource.id, 'kind', resource.kind, 'name', resource.display_name
    ) order by resource.kind) filter (where resource.id is not null), '[]'::jsonb)
  from public.service_booking_requests booking
  join public.workshops workshop on workshop.id = booking.workshop_id
  left join public.service_booking_resource_assignments assignment
    on assignment.booking_request_id = booking.id
  left join public.workshop_schedule_resources resource
    on resource.id = assignment.resource_id
  where private.can_manage_automotive_workshop(workshop.id)
  group by booking.id
$$;

revoke all on function public.get_my_service_booking_resource_assignments()
  from public, anon, authenticated;
grant execute on function public.get_my_service_booking_resource_assignments()
  to authenticated;

create function public.create_workshop_schedule_resource(
  requested_workshop_id uuid,
  requested_kind public.workshop_resource_kind,
  requested_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare created_id uuid;
begin
  if not private.can_manage_automotive_workshop(requested_workshop_id) then
    raise exception 'Workshop manager access required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(requested_name, ''))) not between 2 and 120 then
    raise exception 'Resource name is required' using errcode = '23514';
  end if;
  insert into public.workshop_schedule_resources(workshop_id, kind, display_name)
  values (requested_workshop_id, requested_kind, btrim(requested_name))
  returning id into created_id;
  return created_id;
end;
$$;

revoke all on function public.create_workshop_schedule_resource(uuid, public.workshop_resource_kind, text)
  from public, anon, authenticated;
grant execute on function public.create_workshop_schedule_resource(uuid, public.workshop_resource_kind, text)
  to authenticated;

create function public.set_workshop_schedule_resource_active(
  requested_resource_id uuid, requested_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.workshop_schedule_resources resource set active = requested_active
  where resource.id = requested_resource_id
    and private.can_manage_automotive_workshop(resource.workshop_id);
  if not found then
    raise exception 'Schedule resource is unavailable' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.set_workshop_schedule_resource_active(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_workshop_schedule_resource_active(uuid, boolean)
  to authenticated;

create function public.add_workshop_resource_absence(
  requested_resource_id uuid, requested_starts_at timestamptz,
  requested_ends_at timestamptz, requested_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare created_id uuid; resource_workshop_id uuid;
begin
  select resource.workshop_id into resource_workshop_id
  from public.workshop_schedule_resources resource where resource.id = requested_resource_id;
  if resource_workshop_id is null
    or not private.can_manage_automotive_workshop(resource_workshop_id) then
    raise exception 'Schedule resource is unavailable' using errcode = '42501';
  end if;
  if requested_ends_at <= requested_starts_at then
    raise exception 'A valid absence range is required' using errcode = '23514';
  end if;
  insert into public.workshop_resource_absences(resource_id, starts_at, ends_at, reason)
  values (requested_resource_id, requested_starts_at, requested_ends_at,
    nullif(btrim(requested_reason), '')) returning id into created_id;
  return created_id;
end;
$$;

revoke all on function public.add_workshop_resource_absence(uuid, timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.add_workshop_resource_absence(uuid, timestamptz, timestamptz, text)
  to authenticated;

create function public.remove_workshop_resource_absence(requested_absence_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.workshop_resource_absences absence
  using public.workshop_schedule_resources resource
  where absence.id = requested_absence_id and resource.id = absence.resource_id
    and private.can_manage_automotive_workshop(resource.workshop_id);
  if not found then
    raise exception 'Resource absence is unavailable' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.remove_workshop_resource_absence(uuid)
  from public, anon, authenticated;
grant execute on function public.remove_workshop_resource_absence(uuid)
  to authenticated;

create function public.update_managed_booking_schedule(
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
  requested_end timestamptz;
  candidate_id uuid;
  candidate_kind public.workshop_resource_kind;
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
  if booking_row.status not in ('confirmed', 'checked_in', 'diagnosing', 'awaiting_approval', 'in_service')
    or requested_start is null or requested_duration_minutes not between 15 and 1440 then
    raise exception 'This booking cannot be scheduled' using errcode = '23514';
  end if;
  requested_end := requested_start + make_interval(mins => requested_duration_minutes);

  foreach candidate_id in array array[requested_mechanic_id, requested_facility_id] loop
    if candidate_id is null then continue; end if;
    select resource.kind into candidate_kind
    from public.workshop_schedule_resources resource
    where resource.id = candidate_id and resource.workshop_id = canonical_workshop_id and resource.active;
    if candidate_kind is null
      or (candidate_id = requested_mechanic_id and candidate_kind <> 'mechanic')
      or (candidate_id = requested_facility_id and candidate_kind not in ('bay', 'ramp')) then
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
      join public.service_booking_requests other on other.id = assignment.booking_request_id
      where assignment.resource_id = candidate_id and other.id <> requested_booking_id
        and other.status in ('confirmed', 'checked_in', 'diagnosing', 'awaiting_approval', 'in_service')
        and tstzrange(other.confirmed_start,
          other.confirmed_start + make_interval(mins => other.duration_minutes), '[)')
          && tstzrange(requested_start, requested_end, '[)')
    ) then
      raise exception 'The selected resource is already occupied' using errcode = '23P01';
    end if;
  end loop;

  if not replace_assignments then
    for candidate_id in
      select assignment.resource_id from public.service_booking_resource_assignments assignment
      where assignment.booking_request_id = requested_booking_id
    loop
      if exists (
        select 1 from public.workshop_resource_absences absence
        where absence.resource_id = candidate_id
          and tstzrange(absence.starts_at, absence.ends_at, '[)')
            && tstzrange(requested_start, requested_end, '[)')
      ) or exists (
        select 1 from public.service_booking_resource_assignments assignment
        join public.service_booking_requests other on other.id = assignment.booking_request_id
        where assignment.resource_id = candidate_id and other.id <> requested_booking_id
          and other.status in ('confirmed', 'checked_in', 'diagnosing', 'awaiting_approval', 'in_service')
          and tstzrange(other.confirmed_start,
            other.confirmed_start + make_interval(mins => other.duration_minutes), '[)')
            && tstzrange(requested_start, requested_end, '[)')
      ) then
        raise exception 'An assigned resource is already occupied' using errcode = '23P01';
      end if;
    end loop;
  end if;

  old_start := booking_row.confirmed_start;
  update public.service_booking_requests set confirmed_start = requested_start,
    duration_minutes = requested_duration_minutes, status_changed_at = case
      when confirmed_start is distinct from requested_start then now() else status_changed_at end
  where id = requested_booking_id;

  if replace_assignments then
    delete from public.service_booking_resource_assignments
    where booking_request_id = requested_booking_id;
    if requested_mechanic_id is not null then
      insert into public.service_booking_resource_assignments values
        (requested_booking_id, requested_mechanic_id, now());
    end if;
    if requested_facility_id is not null then
      insert into public.service_booking_resource_assignments values
        (requested_booking_id, requested_facility_id, now());
    end if;
  end if;

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

revoke all on function public.update_managed_booking_schedule(uuid, timestamptz, integer, uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.update_managed_booking_schedule(uuid, timestamptz, integer, uuid, uuid, boolean)
  to authenticated;

alter table public.service_booking_requests
  add column vehicle_vin text check (vehicle_vin is null or vehicle_vin ~ '^[A-HJ-NPR-Z0-9]{17}$');

update public.service_booking_requests booking set vehicle_vin = vehicle.vin
from public.vehicles vehicle where vehicle.id = booking.vehicle_id and vehicle.vin is not null;

create table public.vehicle_service_records (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null unique references public.service_booking_requests(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  customer_id uuid references public.customer_profiles(id) on delete restrict,
  completed_mileage_km integer check (completed_mileage_km is null or completed_mileage_km between 0 and 5000000),
  work_summary text check (work_summary is null or char_length(work_summary) <= 5000),
  inspection_summary text check (inspection_summary is null or char_length(inspection_summary) <= 5000),
  invoice_number text check (invoice_number is null or char_length(invoice_number) <= 80),
  invoice_issued_on date,
  invoice_total_cents bigint check (invoice_total_cents is null or invoice_total_cents >= 0),
  invoice_currency char(3) check (invoice_currency is null or invoice_currency in ('EUR', 'RON', 'HUF')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicle_service_record_parts (
  id uuid primary key default gen_random_uuid(),
  service_record_id uuid not null references public.vehicle_service_records(id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 2 and 500),
  part_number text check (part_number is null or char_length(part_number) <= 120),
  quantity numeric(10,2) not null default 1 check (quantity > 0 and quantity <= 10000),
  warranty_expires_on date,
  display_order integer not null check (display_order between 0 and 99)
);

create table public.vehicle_maintenance_recommendations (
  id uuid primary key default gen_random_uuid(),
  service_record_id uuid not null references public.vehicle_service_records(id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 2 and 500),
  due_on date,
  due_mileage_km integer check (due_mileage_km is null or due_mileage_km between 0 and 5000000),
  completed_at timestamptz,
  display_order integer not null check (display_order between 0 and 99)
);

create trigger vehicle_service_records_updated_at before update on public.vehicle_service_records
for each row execute function public.set_updated_at();

alter table public.vehicle_service_records enable row level security;
alter table public.vehicle_service_record_parts enable row level security;
alter table public.vehicle_maintenance_recommendations enable row level security;
revoke all on table public.vehicle_service_records,
  public.vehicle_service_record_parts, public.vehicle_maintenance_recommendations
  from public, anon, authenticated;

create function public.save_workshop_vehicle_service_record(
  requested_booking_id uuid,
  requested_mileage_km integer,
  requested_work_summary text,
  requested_inspection_summary text,
  requested_invoice_number text,
  requested_invoice_issued_on date,
  requested_invoice_total_cents bigint,
  requested_invoice_currency text,
  requested_parts jsonb,
  requested_recommendations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_row public.service_booking_requests%rowtype;
  canonical_workshop_id uuid;
  record_id uuid;
  normalized_currency text := upper(nullif(btrim(requested_invoice_currency), ''));
begin
  select booking.* into booking_row
  from public.service_booking_requests booking where booking.id = requested_booking_id;
  select workshop.id into canonical_workshop_id
  from public.workshops workshop where workshop.id = booking_row.workshop_id;
  if booking_row.id is null or not private.can_manage_automotive_workshop(canonical_workshop_id) then
    raise exception 'Repair record is unavailable' using errcode = '42501';
  end if;
  if booking_row.status not in ('in_service', 'ready_for_collection', 'completed')
    or requested_mileage_km is not null and requested_mileage_km not between 0 and 5000000
    or normalized_currency is not null and normalized_currency not in ('EUR', 'RON', 'HUF')
    or requested_invoice_total_cents is not null and requested_invoice_total_cents < 0
    or jsonb_typeof(coalesce(requested_parts, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(requested_recommendations, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(requested_parts, '[]'::jsonb)) > 100
    or jsonb_array_length(coalesce(requested_recommendations, '[]'::jsonb)) > 100 then
    raise exception 'Invalid service record details' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(coalesce(requested_parts, '[]'::jsonb)) as item(
      description text, "partNumber" text, quantity numeric, "warrantyExpiresOn" date
    ) where char_length(btrim(coalesce(description, ''))) not between 2 and 500
      or quantity is null or quantity <= 0 or quantity > 10000
  ) or exists (
    select 1 from jsonb_to_recordset(coalesce(requested_recommendations, '[]'::jsonb)) as item(
      description text, "dueOn" date, "dueMileageKm" integer
    ) where char_length(btrim(coalesce(description, ''))) not between 2 and 500
      or "dueMileageKm" is not null and "dueMileageKm" not between 0 and 5000000
  ) then
    raise exception 'Invalid service record items' using errcode = '23514';
  end if;

  insert into public.vehicle_service_records(
    booking_request_id, vehicle_id, customer_id, completed_mileage_km,
    work_summary, inspection_summary, invoice_number, invoice_issued_on,
    invoice_total_cents, invoice_currency
  ) values (
    booking_row.id, booking_row.vehicle_id, booking_row.customer_id,
    coalesce(requested_mileage_km, booking_row.mileage_km),
    nullif(btrim(requested_work_summary), ''), nullif(btrim(requested_inspection_summary), ''),
    nullif(btrim(requested_invoice_number), ''), requested_invoice_issued_on,
    requested_invoice_total_cents, normalized_currency
  ) on conflict (booking_request_id) do update set
    vehicle_id = excluded.vehicle_id, customer_id = excluded.customer_id,
    completed_mileage_km = excluded.completed_mileage_km,
    work_summary = excluded.work_summary, inspection_summary = excluded.inspection_summary,
    invoice_number = excluded.invoice_number, invoice_issued_on = excluded.invoice_issued_on,
    invoice_total_cents = excluded.invoice_total_cents, invoice_currency = excluded.invoice_currency
  returning id into record_id;

  delete from public.vehicle_service_record_parts where service_record_id = record_id;
  insert into public.vehicle_service_record_parts(
    service_record_id, description, part_number, quantity, warranty_expires_on, display_order
  ) select record_id, btrim(item.description), nullif(btrim(item."partNumber"), ''),
    item.quantity, item."warrantyExpiresOn", source.ordinality - 1
  from jsonb_array_elements(coalesce(requested_parts, '[]'::jsonb)) with ordinality source(value, ordinality)
  cross join lateral jsonb_to_record(source.value) as item(
    description text, "partNumber" text, quantity numeric, "warrantyExpiresOn" date
  );

  delete from public.vehicle_maintenance_recommendations where service_record_id = record_id;
  insert into public.vehicle_maintenance_recommendations(
    service_record_id, description, due_on, due_mileage_km, display_order
  ) select record_id, btrim(item.description), item."dueOn", item."dueMileageKm", source.ordinality - 1
  from jsonb_array_elements(coalesce(requested_recommendations, '[]'::jsonb)) with ordinality source(value, ordinality)
  cross join lateral jsonb_to_record(source.value) as item(
    description text, "dueOn" date, "dueMileageKm" integer
  );
  return record_id;
end;
$$;

revoke all on function public.save_workshop_vehicle_service_record(uuid, integer, text, text, text, date, bigint, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_workshop_vehicle_service_record(uuid, integer, text, text, text, date, bigint, text, jsonb, jsonb)
  to authenticated;

insert into public.vehicle_service_records(
  booking_request_id, vehicle_id, customer_id, completed_mileage_km, work_summary,
  invoice_total_cents, invoice_currency
)
select booking.id, booking.vehicle_id, booking.customer_id, booking.mileage_km,
  coalesce(booking.workshop_note, service.name), estimate.total_cents, estimate.currency
from public.service_booking_requests booking
join public.workshop_services service on service.id = booking.service_id
left join lateral (
  select candidate.* from public.repair_estimates candidate
  where candidate.booking_request_id = booking.id and candidate.status = 'approved'
  order by candidate.version desc limit 1
) estimate on true
where booking.status = 'completed'
on conflict (booking_request_id) do nothing;

insert into public.vehicle_service_record_parts(
  service_record_id, description, quantity, display_order
)
select record.id, item.description, item.quantity, item.display_order
from public.vehicle_service_records record
join public.repair_estimates estimate on estimate.booking_request_id = record.booking_request_id
  and estimate.status = 'approved'
join public.repair_estimate_items item on item.estimate_id = estimate.id and item.item_type = 'part'
where not exists (
  select 1 from public.vehicle_service_record_parts existing
  where existing.service_record_id = record.id
);

create function private.ensure_completed_vehicle_service_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare latest_estimate public.repair_estimates%rowtype;
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    select estimate.* into latest_estimate from public.repair_estimates estimate
    where estimate.booking_request_id = new.id and estimate.status = 'approved'
    order by estimate.version desc limit 1;
    insert into public.vehicle_service_records(
      booking_request_id, vehicle_id, customer_id, completed_mileage_km,
      work_summary, invoice_total_cents, invoice_currency
    ) values (
      new.id, new.vehicle_id, new.customer_id, new.mileage_km,
      new.workshop_note, latest_estimate.total_cents, latest_estimate.currency
    ) on conflict (booking_request_id) do nothing;
    if new.vehicle_id is not null and new.mileage_km is not null then
      update public.vehicles set current_mileage_km = greatest(
        coalesce(current_mileage_km, 0), new.mileage_km
      ) where id = new.vehicle_id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.ensure_completed_vehicle_service_record()
  from public, anon, authenticated;
create trigger service_booking_completed_record
after update of status on public.service_booking_requests
for each row execute function private.ensure_completed_vehicle_service_record();

create function public.get_managed_vehicle_service_records()
returns table (booking_id uuid, service_record jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select booking.id, jsonb_build_object(
    'id', record.id, 'vehicleVin', coalesce(booking.vehicle_vin, vehicle.vin),
    'mileageKm', coalesce(record.completed_mileage_km, booking.mileage_km),
    'workSummary', record.work_summary, 'inspectionSummary', record.inspection_summary,
    'invoiceNumber', record.invoice_number, 'invoiceIssuedOn', record.invoice_issued_on,
    'invoiceTotalCents', record.invoice_total_cents, 'invoiceCurrency', record.invoice_currency,
    'parts', coalesce((select jsonb_agg(jsonb_build_object(
      'description', part.description, 'partNumber', part.part_number,
      'quantity', part.quantity, 'warrantyExpiresOn', part.warranty_expires_on
    ) order by part.display_order) from public.vehicle_service_record_parts part
      where part.service_record_id = record.id), '[]'::jsonb),
    'recommendations', coalesce((select jsonb_agg(jsonb_build_object(
      'description', recommendation.description, 'dueOn', recommendation.due_on,
      'dueMileageKm', recommendation.due_mileage_km
    ) order by recommendation.display_order) from public.vehicle_maintenance_recommendations recommendation
      where recommendation.service_record_id = record.id), '[]'::jsonb)
  )
  from public.service_booking_requests booking
  join public.workshops workshop on workshop.id = booking.workshop_id
  left join public.vehicles vehicle on vehicle.id = booking.vehicle_id
  left join public.vehicle_service_records record on record.booking_request_id = booking.id
  where private.can_manage_automotive_workshop(workshop.id)
$$;

revoke all on function public.get_managed_vehicle_service_records()
  from public, anon, authenticated;
grant execute on function public.get_managed_vehicle_service_records()
  to authenticated;

create function public.get_my_vehicle_service_history(requested_vehicle_id uuid)
returns table (service_record jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', record.id, 'bookingId', booking.id, 'completedAt', booking.status_changed_at,
    'workshopName', workshop.display_name, 'serviceName', service.name,
    'vehicleRegistration', booking.vehicle_registration, 'vehicleVin', coalesce(booking.vehicle_vin, vehicle.vin),
    'mileageKm', record.completed_mileage_km, 'workSummary', record.work_summary,
    'inspectionSummary', record.inspection_summary,
    'invoiceNumber', record.invoice_number, 'invoiceIssuedOn', record.invoice_issued_on,
    'invoiceTotalCents', record.invoice_total_cents, 'invoiceCurrency', record.invoice_currency,
    'parts', coalesce((select jsonb_agg(jsonb_build_object(
      'description', part.description, 'partNumber', part.part_number,
      'quantity', part.quantity, 'warrantyExpiresOn', part.warranty_expires_on
    ) order by part.display_order) from public.vehicle_service_record_parts part
      where part.service_record_id = record.id), '[]'::jsonb),
    'recommendations', coalesce((select jsonb_agg(jsonb_build_object(
      'description', recommendation.description, 'dueOn', recommendation.due_on,
      'dueMileageKm', recommendation.due_mileage_km,
      'completedAt', recommendation.completed_at
    ) order by recommendation.display_order) from public.vehicle_maintenance_recommendations recommendation
      where recommendation.service_record_id = record.id), '[]'::jsonb)
  )
  from public.vehicles vehicle
  join public.customer_profiles customer on customer.id = vehicle.customer_id
  join public.vehicle_service_records record
    on record.vehicle_id = vehicle.id or (
      record.customer_id = vehicle.customer_id and exists (
        select 1 from public.service_booking_requests matched
        where matched.id = record.booking_request_id
          and upper(matched.vehicle_registration) = upper(vehicle.registration_number)
      )
    )
  join public.service_booking_requests booking on booking.id = record.booking_request_id
  join public.workshop_services service on service.id = booking.service_id
  join public.workshops workshop on workshop.id = booking.workshop_id
  where vehicle.id = requested_vehicle_id
    and customer.auth_user_id = (select auth.uid()) and booking.status = 'completed'
  order by booking.status_changed_at desc
$$;

revoke all on function public.get_my_vehicle_service_history(uuid)
  from public, anon, authenticated;
grant execute on function public.get_my_vehicle_service_history(uuid)
  to authenticated;

create function public.create_public_service_booking_request_v2(
  requested_workshop_id uuid, requested_service_id uuid,
  requested_customer_name text, requested_customer_phone text,
  requested_customer_email text, requested_vehicle_registration text,
  requested_vehicle_make text, requested_vehicle_model text,
  requested_vehicle_year integer, requested_vehicle_vin text,
  requested_mileage_km integer, requested_preferred_start timestamptz,
  requested_alternate_start timestamptz, requested_customer_note text,
  requested_mobility_requirement text, requested_locale text,
  requested_management_token_digest text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare created_booking_id uuid; normalized_vin text := upper(nullif(btrim(requested_vehicle_vin), ''));
begin
  if normalized_vin is not null and normalized_vin !~ '^[A-HJ-NPR-Z0-9]{17}$' then
    raise exception 'VIN must contain 17 valid characters' using errcode = '23514';
  end if;
  created_booking_id := public.create_public_service_booking_request(
    requested_workshop_id, requested_service_id, requested_customer_name,
    requested_customer_phone, requested_customer_email,
    requested_vehicle_registration, requested_vehicle_make, requested_vehicle_model,
    requested_vehicle_year, requested_mileage_km, requested_preferred_start,
    requested_alternate_start, requested_customer_note,
    requested_mobility_requirement, requested_locale,
    requested_management_token_digest
  );
  update public.service_booking_requests booking set
    vehicle_vin = coalesce(normalized_vin, vehicle.vin)
  from public.vehicles vehicle
  where booking.id = created_booking_id and vehicle.id = booking.vehicle_id;
  if not found and normalized_vin is not null then
    update public.service_booking_requests set vehicle_vin = normalized_vin
    where id = created_booking_id;
  end if;
  return created_booking_id;
end;
$$;

revoke all on function public.create_public_service_booking_request_v2(
  uuid, uuid, text, text, text, text, text, text, integer, text, integer,
  timestamptz, timestamptz, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_public_service_booking_request_v2(
  uuid, uuid, text, text, text, text, text, text, integer, text, integer,
  timestamptz, timestamptz, text, text, text, text
) to anon, authenticated;

create function public.create_managed_service_appointment_v3(
  requested_workshop_id uuid, requested_service_id uuid,
  requested_start timestamptz, requested_duration_minutes integer,
  requested_source text, requested_customer_name text,
  requested_customer_phone text, requested_customer_email text,
  requested_vehicle_registration text, requested_vehicle_make text,
  requested_vehicle_model text, requested_vehicle_year integer,
  requested_vehicle_vin text, requested_mileage_km integer,
  requested_note text, requested_locale text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare created_booking_id uuid; normalized_vin text := upper(nullif(btrim(requested_vehicle_vin), ''));
begin
  if normalized_vin is not null and normalized_vin !~ '^[A-HJ-NPR-Z0-9]{17}$' then
    raise exception 'VIN must contain 17 valid characters' using errcode = '23514';
  end if;
  created_booking_id := public.create_managed_service_appointment_v2(
    requested_workshop_id, requested_service_id, requested_start,
    requested_duration_minutes, requested_source, requested_customer_name,
    requested_customer_phone, requested_customer_email,
    requested_vehicle_registration, requested_vehicle_make,
    requested_vehicle_model, requested_vehicle_year, requested_mileage_km,
    requested_note, requested_locale
  );
  update public.service_booking_requests set vehicle_vin = normalized_vin
  where id = created_booking_id;
  return created_booking_id;
end;
$$;

revoke all on function public.create_managed_service_appointment_v3(
  uuid, uuid, timestamptz, integer, text, text, text, text,
  text, text, text, integer, text, integer, text, text
) from public, anon, authenticated;
grant execute on function public.create_managed_service_appointment_v3(
  uuid, uuid, timestamptz, integer, text, text, text, text,
  text, text, text, integer, text, integer, text, text
) to authenticated;

comment on table public.workshop_schedule_resources is
  'Location-scoped mechanics, bays, and ramps available for calendar assignment.';
comment on table public.vehicle_service_records is
  'Portable customer-owned service history anchored to a completed service booking.';

commit;
