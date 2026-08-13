begin;

create type public.workshop_warranty_case_kind as enum ('warranty', 'comeback');
create type public.workshop_warranty_case_status as enum ('open', 'resolved');
create type public.maintenance_outreach_channel as enum ('phone', 'email', 'in_app');
create type public.maintenance_outreach_status as enum ('contacted', 'not_reached', 'sent', 'failed');

alter table public.vehicle_service_records
  add column labour_warranty_expires_on date;

create table public.workshop_warranty_cases (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete restrict,
  original_booking_id uuid not null references public.service_booking_requests(id) on delete restrict,
  return_booking_id uuid not null unique references public.service_booking_requests(id) on delete restrict,
  case_kind public.workshop_warranty_case_kind not null,
  status public.workshop_warranty_case_status not null default 'open',
  responsible_technician_resource_id uuid references public.workshop_schedule_resources(id) on delete set null,
  internal_notes text check (internal_notes is null or char_length(internal_notes) <= 5000),
  resolution text check (resolution is null or char_length(resolution) <= 5000),
  created_by_workshop_manager_id uuid not null references public.workshop_manager_profiles(id) on delete restrict,
  resolved_by_workshop_manager_id uuid references public.workshop_manager_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  check (original_booking_id <> return_booking_id),
  check ((status = 'resolved') = (resolved_at is not null))
);

create index workshop_warranty_cases_location_status_idx
  on public.workshop_warranty_cases(workshop_id, status, created_at desc);
create index workshop_warranty_cases_original_idx
  on public.workshop_warranty_cases(original_booking_id, created_at desc);
create trigger workshop_warranty_cases_updated_at before update on public.workshop_warranty_cases
for each row execute function public.set_updated_at();

create table public.maintenance_outreach_events (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.vehicle_maintenance_recommendations(id) on delete restrict,
  workshop_id uuid not null references public.workshops(id) on delete restrict,
  channel public.maintenance_outreach_channel not null,
  status public.maintenance_outreach_status not null,
  note text check (note is null or char_length(note) <= 1000),
  actor_workshop_manager_id uuid not null references public.workshop_manager_profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index maintenance_outreach_events_recommendation_idx
  on public.maintenance_outreach_events(recommendation_id, created_at desc);

create table public.customer_maintenance_notifications (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null unique references public.vehicle_maintenance_recommendations(id) on delete restrict,
  workshop_id uuid not null references public.workshops(id) on delete restrict,
  customer_id uuid not null references public.customer_profiles(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  message text not null check (char_length(btrim(message)) between 2 and 500),
  workshop_slug text not null,
  published_at timestamptz not null default now(),
  dismissed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index customer_maintenance_notifications_customer_idx
  on public.customer_maintenance_notifications(customer_id, dismissed_at, published_at desc);
create trigger customer_maintenance_notifications_updated_at before update on public.customer_maintenance_notifications
for each row execute function public.set_updated_at();

alter table public.workshop_warranty_cases enable row level security;
alter table public.maintenance_outreach_events enable row level security;
alter table public.customer_maintenance_notifications enable row level security;
revoke all on table public.workshop_warranty_cases, public.maintenance_outreach_events,
  public.customer_maintenance_notifications from public, anon, authenticated;

create function private.current_workshop_manager_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select manager.id from public.workshop_manager_profiles manager
  join public.account_identities identity on identity.auth_user_id = manager.auth_user_id
    and identity.status = 'active'
  where manager.auth_user_id = (select auth.uid()) and manager.status = 'active'
$$;

revoke all on function private.current_workshop_manager_id() from public, anon, authenticated;

create function public.set_workshop_job_warranty(
  requested_booking_id uuid,
  requested_labour_warranty_expires_on date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare booking_row public.service_booking_requests%rowtype; record_id uuid;
begin
  select * into booking_row from public.service_booking_requests booking
  where booking.id = requested_booking_id for update;
  if booking_row.id is null or booking_row.status <> 'completed'
    or not private.can_manage_automotive_workshop(booking_row.workshop_id) then
    raise exception 'Completed managed job required' using errcode = '42501';
  end if;
  update public.vehicle_service_records record set
    labour_warranty_expires_on = requested_labour_warranty_expires_on
  where record.booking_request_id = booking_row.id returning record.id into record_id;
  if record_id is null then
    raise exception 'Service record required' using errcode = '23514';
  end if;
  return record_id;
end;
$$;

revoke all on function public.set_workshop_job_warranty(uuid, date) from public, anon;
grant execute on function public.set_workshop_job_warranty(uuid, date) to authenticated;

create function public.create_workshop_warranty_case(
  requested_original_booking_id uuid,
  requested_return_booking_id uuid,
  requested_case_kind text,
  requested_responsible_technician_resource_id uuid,
  requested_internal_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  original_job public.service_booking_requests%rowtype;
  return_job public.service_booking_requests%rowtype;
  manager_id uuid := private.current_workshop_manager_id();
  technician_id uuid;
  created_id uuid;
begin
  select * into original_job from public.service_booking_requests booking
    where booking.id = requested_original_booking_id for update;
  select * into return_job from public.service_booking_requests booking
    where booking.id = requested_return_booking_id for update;
  if manager_id is null or original_job.id is null or return_job.id is null
    or original_job.status <> 'completed'
    or return_job.status in ('declined', 'cancelled', 'no_show')
    or original_job.workshop_id <> return_job.workshop_id
    or upper(original_job.vehicle_registration) <> upper(return_job.vehicle_registration)
    or original_job.id = return_job.id
    or requested_case_kind not in ('warranty', 'comeback')
    or not private.can_manage_automotive_workshop(return_job.workshop_id) then
    raise exception 'Invalid managed warranty case' using errcode = '42501';
  end if;
  if requested_responsible_technician_resource_id is not null then
    select resource.id into technician_id from public.workshop_schedule_resources resource
    where resource.id = requested_responsible_technician_resource_id
      and resource.workshop_id = original_job.workshop_id and resource.kind = 'mechanic';
    if technician_id is null then
      raise exception 'Responsible mechanic must belong to the original workshop' using errcode = '23514';
    end if;
  else
    select resource.id into technician_id
    from public.service_booking_resource_assignments assignment
    join public.workshop_schedule_resources resource on resource.id = assignment.resource_id
      and resource.kind = 'mechanic'
    where assignment.booking_request_id = original_job.id order by assignment.assigned_at limit 1;
  end if;
  insert into public.workshop_warranty_cases(
    workshop_id, original_booking_id, return_booking_id, case_kind,
    responsible_technician_resource_id, internal_notes, created_by_workshop_manager_id
  ) values (
    return_job.workshop_id, original_job.id, return_job.id,
    requested_case_kind::public.workshop_warranty_case_kind, technician_id,
    nullif(btrim(requested_internal_notes), ''), manager_id
  ) returning id into created_id;
  return created_id;
end;
$$;

revoke all on function public.create_workshop_warranty_case(uuid, uuid, text, uuid, text) from public, anon;
grant execute on function public.create_workshop_warranty_case(uuid, uuid, text, uuid, text) to authenticated;

create function public.resolve_workshop_warranty_case(
  requested_case_id uuid,
  requested_resolution text,
  requested_internal_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare case_row public.workshop_warranty_cases%rowtype; manager_id uuid := private.current_workshop_manager_id();
begin
  select * into case_row from public.workshop_warranty_cases warranty_case
    where warranty_case.id = requested_case_id for update;
  if manager_id is null or case_row.id is null or case_row.status <> 'open'
    or not private.can_manage_automotive_workshop(case_row.workshop_id)
    or char_length(btrim(coalesce(requested_resolution, ''))) not between 2 and 5000 then
    raise exception 'Open managed warranty case required' using errcode = '42501';
  end if;
  update public.workshop_warranty_cases set status = 'resolved',
    resolution = btrim(requested_resolution),
    internal_notes = coalesce(nullif(btrim(requested_internal_notes), ''), internal_notes),
    resolved_by_workshop_manager_id = manager_id, resolved_at = now()
  where id = case_row.id;
end;
$$;

revoke all on function public.resolve_workshop_warranty_case(uuid, text, text) from public, anon;
grant execute on function public.resolve_workshop_warranty_case(uuid, text, text) to authenticated;

create function public.get_managed_quality_workspace()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'cases', coalesce((select jsonb_agg(jsonb_build_object(
      'id', warranty_case.id, 'workshopId', workshop.id, 'workshopName', workshop.display_name,
      'kind', warranty_case.case_kind, 'status', warranty_case.status,
      'originalBookingId', original_job.id, 'returnBookingId', return_job.id,
      'vehicleRegistration', return_job.vehicle_registration,
      'customerName', return_job.customer_name, 'serviceName', return_service.name,
      'originalCompletedAt', original_job.status_changed_at,
      'technicianName', technician.display_name,
      'labourWarrantyExpiresOn', record.labour_warranty_expires_on,
      'partsWarranty', coalesce((select jsonb_agg(jsonb_build_object(
        'description', part.description, 'expiresOn', part.warranty_expires_on
      ) order by part.display_order) from public.vehicle_service_record_parts part
        where part.service_record_id = record.id and part.warranty_expires_on is not null), '[]'::jsonb),
      'internalNotes', warranty_case.internal_notes, 'resolution', warranty_case.resolution,
      'createdAt', warranty_case.created_at, 'resolvedAt', warranty_case.resolved_at
    ) order by warranty_case.status, warranty_case.created_at desc)
    from public.workshop_warranty_cases warranty_case
    join public.workshops workshop on workshop.id = warranty_case.workshop_id
    join public.service_booking_requests original_job on original_job.id = warranty_case.original_booking_id
    join public.service_booking_requests return_job on return_job.id = warranty_case.return_booking_id
    join public.workshop_services return_service on return_service.id = return_job.service_id
    left join public.vehicle_service_records record on record.booking_request_id = original_job.id
    left join public.workshop_schedule_resources technician on technician.id = warranty_case.responsible_technician_resource_id
    where private.can_manage_automotive_workshop(workshop.id)), '[]'::jsonb),
    'originalJobs', coalesce((select jsonb_agg(jsonb_build_object(
      'id', booking.id, 'workshopId', workshop.id, 'workshopName', workshop.display_name,
      'customerName', booking.customer_name, 'vehicleRegistration', booking.vehicle_registration,
      'vehicleLabel', concat_ws(' ', booking.vehicle_make, booking.vehicle_model),
      'serviceName', service.name, 'completedAt', booking.status_changed_at,
      'labourWarrantyExpiresOn', record.labour_warranty_expires_on
    ) order by booking.status_changed_at desc)
    from public.service_booking_requests booking
    join public.workshops workshop on workshop.id = booking.workshop_id
    join public.workshop_services service on service.id = booking.service_id
    left join public.vehicle_service_records record on record.booking_request_id = booking.id
    where booking.status = 'completed' and private.can_manage_automotive_workshop(workshop.id)), '[]'::jsonb),
    'returnJobs', coalesce((select jsonb_agg(jsonb_build_object(
      'id', booking.id, 'workshopId', workshop.id, 'workshopName', workshop.display_name,
      'customerName', booking.customer_name, 'vehicleRegistration', booking.vehicle_registration,
      'vehicleLabel', concat_ws(' ', booking.vehicle_make, booking.vehicle_model),
      'serviceName', service.name, 'status', booking.status
    ) order by coalesce(booking.confirmed_start, booking.preferred_start) desc)
    from public.service_booking_requests booking
    join public.workshops workshop on workshop.id = booking.workshop_id
    join public.workshop_services service on service.id = booking.service_id
    where booking.status not in ('declined', 'cancelled', 'no_show')
      and private.can_manage_automotive_workshop(workshop.id)
      and not exists (select 1 from public.workshop_warranty_cases existing where existing.return_booking_id = booking.id)), '[]'::jsonb),
    'mechanics', coalesce((select jsonb_agg(jsonb_build_object(
      'id', resource.id, 'workshopId', resource.workshop_id, 'name', resource.display_name
    ) order by resource.display_name) from public.workshop_schedule_resources resource
      where resource.kind = 'mechanic' and resource.active
        and private.can_manage_automotive_workshop(resource.workshop_id)), '[]'::jsonb),
    'dueReminders', coalesce((select jsonb_agg(jsonb_build_object(
      'id', recommendation.id, 'workshopId', workshop.id, 'workshopName', workshop.display_name,
      'workshopSlug', workshop.slug, 'customerName', booking.customer_name,
      'customerPhone', booking.customer_phone, 'customerEmail', booking.customer_email,
      'vehicleRegistration', booking.vehicle_registration,
      'vehicleLabel', concat_ws(' ', booking.vehicle_make, booking.vehicle_model),
      'description', recommendation.description, 'dueOn', recommendation.due_on,
      'dueMileageKm', recommendation.due_mileage_km,
      'lastOutreach', (select jsonb_build_object('channel', outreach.channel, 'status', outreach.status, 'createdAt', outreach.created_at)
        from public.maintenance_outreach_events outreach where outreach.recommendation_id = recommendation.id
        order by outreach.created_at desc limit 1)
    ) order by recommendation.due_on nulls last)
    from public.vehicle_maintenance_recommendations recommendation
    join public.vehicle_service_records record on record.id = recommendation.service_record_id
    join public.service_booking_requests booking on booking.id = record.booking_request_id
    join public.workshops workshop on workshop.id = booking.workshop_id
    where recommendation.completed_at is null
      and recommendation.due_on is not null
      and recommendation.due_on <= current_date + 45
      and private.can_manage_automotive_workshop(workshop.id)), '[]'::jsonb)
  )
$$;

revoke all on function public.get_managed_quality_workspace() from public, anon;
grant execute on function public.get_managed_quality_workspace() to authenticated;

create function public.get_managed_maintenance_outreach_context(requested_recommendation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'recommendationId', recommendation.id, 'workshopId', workshop.id,
    'workshopName', workshop.display_name, 'workshopSlug', workshop.slug,
    'customerName', booking.customer_name, 'customerPhone', booking.customer_phone,
    'customerEmail', booking.customer_email, 'description', recommendation.description,
    'dueOn', recommendation.due_on, 'vehicleRegistration', booking.vehicle_registration
  )
  from public.vehicle_maintenance_recommendations recommendation
  join public.vehicle_service_records record on record.id = recommendation.service_record_id
  join public.service_booking_requests booking on booking.id = record.booking_request_id
  join public.workshops workshop on workshop.id = booking.workshop_id
  where recommendation.id = requested_recommendation_id
    and recommendation.completed_at is null
    and private.can_manage_automotive_workshop(workshop.id)
$$;

revoke all on function public.get_managed_maintenance_outreach_context(uuid) from public, anon;
grant execute on function public.get_managed_maintenance_outreach_context(uuid) to authenticated;

create function public.record_workshop_maintenance_outreach(
  requested_recommendation_id uuid,
  requested_channel text,
  requested_status text,
  requested_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  recommendation_row public.vehicle_maintenance_recommendations%rowtype;
  booking_row public.service_booking_requests%rowtype;
  workshop_row public.workshops%rowtype;
  manager_id uuid := private.current_workshop_manager_id(); event_id uuid;
begin
  select recommendation.* into recommendation_row
  from public.vehicle_maintenance_recommendations recommendation
  where recommendation.id = requested_recommendation_id;
  select booking.* into booking_row from public.vehicle_service_records record
  join public.service_booking_requests booking on booking.id = record.booking_request_id
  where record.id = recommendation_row.service_record_id;
  select * into workshop_row from public.workshops workshop where workshop.id = booking_row.workshop_id;
  if manager_id is null or recommendation_row.id is null or recommendation_row.completed_at is not null
    or not private.can_manage_automotive_workshop(workshop_row.id)
    or requested_channel not in ('phone', 'email', 'in_app')
    or requested_status not in ('contacted', 'not_reached', 'sent', 'failed')
    or (requested_channel = 'phone' and requested_status not in ('contacted', 'not_reached'))
    or (requested_channel in ('email', 'in_app') and requested_status not in ('sent', 'failed')) then
    raise exception 'Invalid maintenance outreach event' using errcode = '42501';
  end if;
  insert into public.maintenance_outreach_events(
    recommendation_id, workshop_id, channel, status, note, actor_workshop_manager_id
  ) values (
    recommendation_row.id, workshop_row.id,
    requested_channel::public.maintenance_outreach_channel,
    requested_status::public.maintenance_outreach_status,
    nullif(btrim(requested_note), ''), manager_id
  ) returning id into event_id;
  if requested_channel = 'in_app' and requested_status = 'sent' then
    if booking_row.customer_id is null then
      raise exception 'Customer account required for in-app reminder' using errcode = '23514';
    end if;
    insert into public.customer_maintenance_notifications(
      recommendation_id, workshop_id, customer_id, title, message, workshop_slug,
      published_at, dismissed_at
    ) values (
      recommendation_row.id, workshop_row.id, booking_row.customer_id,
      recommendation_row.description,
      concat('Your ', booking_row.vehicle_registration, ' is due for ', recommendation_row.description, '.'),
      workshop_row.slug, now(), null
    ) on conflict (recommendation_id) do update set
      title = excluded.title, message = excluded.message, workshop_slug = excluded.workshop_slug,
      published_at = now(), dismissed_at = null;
  end if;
  return event_id;
end;
$$;

revoke all on function public.record_workshop_maintenance_outreach(uuid, text, text, text) from public, anon;
grant execute on function public.record_workshop_maintenance_outreach(uuid, text, text, text) to authenticated;

create function public.get_my_customer_maintenance_notifications()
returns table(notification jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', notification.id, 'title', notification.title, 'message', notification.message,
    'workshopName', workshop.display_name, 'bookingUrl', concat('/workshops/', notification.workshop_slug, '#appointment'),
    'publishedAt', notification.published_at
  )
  from public.customer_maintenance_notifications notification
  join public.customer_profiles customer on customer.id = notification.customer_id
  join public.account_identities identity on identity.auth_user_id = customer.auth_user_id and identity.status = 'active'
  join public.workshops workshop on workshop.id = notification.workshop_id
  where customer.auth_user_id = (select auth.uid()) and notification.dismissed_at is null
  order by notification.published_at desc
$$;

revoke all on function public.get_my_customer_maintenance_notifications() from public, anon;
grant execute on function public.get_my_customer_maintenance_notifications() to authenticated;

create function public.dismiss_my_customer_maintenance_notification(requested_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.customer_maintenance_notifications notification set dismissed_at = now()
  from public.customer_profiles customer
  join public.account_identities identity on identity.auth_user_id = customer.auth_user_id and identity.status = 'active'
  where notification.id = requested_notification_id and notification.customer_id = customer.id
    and customer.auth_user_id = (select auth.uid());
  if not found then raise exception 'Notification unavailable' using errcode = '42501'; end if;
end;
$$;

revoke all on function public.dismiss_my_customer_maintenance_notification(uuid) from public, anon;
grant execute on function public.dismiss_my_customer_maintenance_notification(uuid) to authenticated;

create function public.get_service_organisation_quality_metrics(requested_service_provider_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not private.can_manage_service_organisation(requested_service_provider_id) then
    raise exception 'Service organisation owner access required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'openCases', (select count(*) from public.workshop_warranty_cases warranty_case
      join public.workshops workshop on workshop.id = warranty_case.workshop_id
      where workshop.service_provider_id = requested_service_provider_id
        and warranty_case.status = 'open'),
    'resolvedCases', (select count(*) from public.workshop_warranty_cases warranty_case
      join public.workshops workshop on workshop.id = warranty_case.workshop_id
      where workshop.service_provider_id = requested_service_provider_id
        and warranty_case.status = 'resolved'
        and warranty_case.created_at >= now() - interval '6 months'),
    'comebackRate', coalesce(round(100.0 * (select count(*) from public.workshop_warranty_cases warranty_case
      join public.workshops workshop on workshop.id = warranty_case.workshop_id
      where workshop.service_provider_id = requested_service_provider_id
        and warranty_case.created_at >= now() - interval '6 months')
      / nullif((select count(*) from public.service_booking_requests booking
        join public.workshops workshop on workshop.id = booking.workshop_id
        where workshop.service_provider_id = requested_service_provider_id
          and booking.status = 'completed'
          and booking.status_changed_at >= now() - interval '6 months'), 0), 1), 0),
    'locations', coalesce((select jsonb_agg(jsonb_build_object(
      'workshopId', location.workshop_id, 'workshopName', location.workshop_name,
      'openCases', location.open_cases, 'totalCases', location.total_cases
    ) order by location.workshop_name) from (
      select workshop.id as workshop_id, workshop.display_name as workshop_name,
        count(warranty_case.id) filter (where warranty_case.status = 'open') as open_cases,
        count(warranty_case.id) as total_cases
      from public.workshops workshop
      left join public.workshop_warranty_cases warranty_case
        on warranty_case.workshop_id = workshop.id
        and warranty_case.created_at >= now() - interval '6 months'
      where workshop.service_provider_id = requested_service_provider_id
      group by workshop.id, workshop.display_name
    ) location), '[]'::jsonb)
  ) into result;
  return coalesce(result, jsonb_build_object('openCases', 0, 'resolvedCases', 0, 'comebackRate', 0, 'locations', '[]'::jsonb));
end;
$$;

revoke all on function public.get_service_organisation_quality_metrics(uuid) from public, anon;
grant execute on function public.get_service_organisation_quality_metrics(uuid) to authenticated;

comment on table public.workshop_warranty_cases is
  'Location-scoped warranty and comeback quality cases linked to the original and returning jobs.';
comment on table public.maintenance_outreach_events is
  'Auditable workshop-manager loyalty outreach for due vehicle maintenance recommendations.';
comment on table public.customer_maintenance_notifications is
  'Customer-owned in-app maintenance reminders with a canonical workshop booking link.';

commit;
