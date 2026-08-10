begin;

-- Publication is derived instead of approved manually. Pending locations are
-- onboarding records and may publish as soon as every readiness condition is
-- true; suspended or rejected locations remain an explicit administrative stop.
create function private.is_workshop_publication_eligible(
  requested_workshop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workshops workshop
    join public.service_providers provider
      on provider.id = workshop.service_provider_id
      and provider.status = 'active'
    where workshop.id = requested_workshop_id
      and workshop.status in ('pending', 'active')
      and nullif(btrim(workshop.display_name), '') is not null
      and nullif(btrim(workshop.city), '') is not null
      and nullif(btrim(workshop.address), '') is not null
      and workshop.latitude between -90 and 90
      and workshop.longitude between -180 and 180
      and private.has_workshop_billing_coverage(workshop.id)
      and exists (
        select 1
        from public.workshop_manager_assignments assignment
        join public.workshop_manager_profiles manager
          on manager.id = assignment.workshop_manager_id
          and manager.status = 'active'
        join public.account_identities identity
          on identity.auth_user_id = manager.auth_user_id
          and identity.status = 'active'
        where assignment.workshop_id = workshop.id
          and assignment.assignment_role = 'primary_manager'
          and assignment.status = 'active'
          and assignment.starts_on <= current_date
          and (assignment.ends_before is null
            or assignment.ends_before > current_date)
      )
  )
$$;

revoke all on function private.is_workshop_publication_eligible(uuid)
  from public, anon, authenticated;

-- The resolved manager identity is the single location-scoped authorization
-- primitive used by all workshop operational RPCs.
create function private.current_workshop_manager_id(
  requested_workshop_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select manager.id
  from public.workshops workshop
  join public.service_providers provider
    on provider.id = workshop.service_provider_id
    and provider.status = 'active'
  join public.workshop_manager_assignments assignment
    on assignment.workshop_id = workshop.id
    and assignment.status = 'active'
    and assignment.starts_on <= current_date
    and (assignment.ends_before is null
      or assignment.ends_before > current_date)
  join public.workshop_manager_profiles manager
    on manager.id = assignment.workshop_manager_id
    and manager.status = 'active'
  join public.workshop_manager_memberships membership
    on membership.workshop_manager_id = manager.id
    and membership.service_provider_id = workshop.service_provider_id
    and membership.status = 'active'
    and membership.membership_role in ('owner', 'manager')
  join public.account_identities identity
    on identity.auth_user_id = manager.auth_user_id
    and identity.status = 'active'
  where workshop.id = requested_workshop_id
    and workshop.status in ('pending', 'active')
    and manager.auth_user_id = (select auth.uid())
  order by (assignment.assignment_role = 'primary_manager') desc,
    assignment.created_at
  limit 1
$$;

revoke all on function private.current_workshop_manager_id(uuid)
  from public, anon, authenticated;

create or replace function private.can_manage_automotive_workshop(
  requested_workshop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_workshop_manager_id(requested_workshop_id) is not null
$$;

create or replace function private.can_manage_workshop(requested_workshop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_automotive_workshop(requested_workshop_id)
$$;

create or replace function public.search_public_workshops(requested_search text default null)
returns table (
  workshop_id uuid, display_name text, description text, country_code char(2),
  city text, practice_address text, latitude numeric, longitude numeric,
  public_phone text, public_email text, offers_pickup boolean,
  offers_courtesy_car boolean, service_categories text[], price_from_cents integer
)
language sql stable security definer set search_path = ''
as $$
  select workshop.id, workshop.display_name, workshop.description,
    workshop.country_code, workshop.city, workshop.address,
    workshop.latitude, workshop.longitude, workshop.public_phone,
    workshop.public_email, workshop.offers_pickup, workshop.offers_courtesy_car,
    coalesce(summary.categories, array[]::text[]), summary.price_from_cents
  from public.workshops workshop
  left join lateral (
    select array_agg(distinct service.category order by service.category) categories,
      min(service.price_from_cents) price_from_cents
    from public.workshop_services service
    where service.workshop_id = workshop.id and service.active
  ) summary on true
  where private.is_workshop_publication_eligible(workshop.id)
    and (nullif(btrim(requested_search), '') is null
      or concat_ws(' ', workshop.display_name, workshop.description,
        workshop.city, workshop.address, array_to_string(summary.categories, ' '))
        ilike '%' || btrim(requested_search) || '%')
  order by workshop.display_name
$$;

-- Public detail discovery follows publication; online booking availability is
-- intentionally separate and remains controlled by accepts_booking_requests.
create or replace function public.get_public_workshop_services_v2(requested_workshop_id uuid)
returns table (
  service_id uuid, service_code text, name text, category text,
  description text, vehicle_type public.automotive_vehicle_type,
  booking_mode public.workshop_service_booking_mode,
  estimated_duration_minutes integer, price_from_cents integer,
  currency char(3), requires_diagnosis boolean,
  diagnosis_fee_cents integer, diagnosis_currency char(3)
)
language sql stable security definer set search_path = ''
as $$
  select service.id, service.service_code, service.name, service.category,
    service.description, service.vehicle_type, service.booking_mode,
    service.estimated_duration_minutes, service.price_from_cents,
    service.currency, service.requires_diagnosis,
    diagnosis.price_from_cents, diagnosis.currency
  from public.workshop_services service
  join public.workshops workshop on workshop.id = service.workshop_id
  left join lateral (
    select fee.price_from_cents, fee.currency
    from public.workshop_services fee
    where fee.workshop_id = service.workshop_id
      and fee.service_code = 'diagnosis' and fee.active and fee.price_from_cents > 0
    order by (fee.vehicle_type = service.vehicle_type) desc limit 1
  ) diagnosis on true
  where workshop.id = requested_workshop_id
    and private.is_workshop_publication_eligible(workshop.id)
    and workshop.accepts_booking_requests and service.active
    and (service.booking_mode <> 'diagnosis_first'
      or diagnosis.price_from_cents is not null)
  order by service.display_order, service.name
$$;

create or replace function public.get_public_workshop_services(requested_workshop_id uuid)
returns table (
  service_id uuid, name text, category text, description text,
  estimated_duration_minutes integer, price_from_cents integer,
  currency char(3), requires_diagnosis boolean
)
language sql stable security definer set search_path = ''
as $$
  select service.id, service.name, service.category, service.description,
    service.estimated_duration_minutes, service.price_from_cents,
    service.currency, service.requires_diagnosis
  from public.workshops workshop
  join public.workshop_services service on service.workshop_id = workshop.id
  where workshop.id = requested_workshop_id
    and private.is_workshop_publication_eligible(workshop.id)
    and workshop.accepts_booking_requests and service.active
  order by service.display_order, service.name
$$;

create or replace function public.get_public_workshop_booking_rules(requested_workshop_id uuid)
returns table (
  minimum_lead_minutes integer, booking_horizon_days integer,
  slot_interval_minutes integer, offers_pickup boolean,
  offers_courtesy_car boolean, allows_wait_on_site boolean, time_zone text,
  earliest_booking_date date, latest_booking_date date,
  operating_hours jsonb, closures jsonb
)
language sql stable security definer set search_path = ''
as $$
  select workshop.minimum_lead_minutes, workshop.booking_horizon_days,
    workshop.slot_interval_minutes, workshop.offers_pickup,
    workshop.offers_courtesy_car, workshop.allows_wait_on_site,
    workshop.time_zone,
    ((now() + make_interval(mins => workshop.minimum_lead_minutes)) at time zone workshop.time_zone)::date,
    ((now() + make_interval(days => workshop.booking_horizon_days)) at time zone workshop.time_zone)::date,
    coalesce((select jsonb_agg(jsonb_build_object(
      'weekday', hours.weekday, 'opensAt', hours.opens_at,
      'closesAt', hours.closes_at, 'closed', hours.closed
    ) order by hours.weekday) from public.workshop_operating_hours hours
      where hours.workshop_id = workshop.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'startsAt', closure.starts_at, 'endsAt', closure.ends_at
    ) order by closure.starts_at) from public.workshop_closures closure
      where closure.workshop_id = workshop.id and closure.ends_at > now()), '[]'::jsonb)
  from public.workshops workshop
  where workshop.id = requested_workshop_id
    and private.is_workshop_publication_eligible(workshop.id)
    and workshop.accepts_booking_requests
$$;

create or replace function public.create_public_service_booking_request(
  requested_workshop_id uuid, requested_service_id uuid,
  requested_customer_name text, requested_customer_phone text,
  requested_customer_email text, requested_vehicle_registration text,
  requested_vehicle_make text, requested_vehicle_model text,
  requested_vehicle_year integer, requested_mileage_km integer,
  requested_preferred_start timestamptz, requested_alternate_start timestamptz,
  requested_customer_note text, requested_mobility_requirement text,
  requested_locale text, requested_management_token_digest text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  created_request_id uuid; resolved_customer_id uuid; resolved_vehicle_id uuid;
  workshop_row public.workshops%rowtype; requested_local timestamp;
  requested_weekday smallint; open_time time; close_time time;
  requests_on_day integer;
begin
  select workshop.* into workshop_row
  from public.workshops workshop
  where workshop.id = requested_workshop_id
    and private.is_workshop_publication_eligible(workshop.id)
    and workshop.accepts_booking_requests
  for update of workshop;

  if workshop_row.id is null or not exists (
    select 1 from public.workshop_services service
    where service.id = requested_service_id
      and service.workshop_id = requested_workshop_id and service.active
  ) then
    raise exception 'Workshop service is unavailable' using errcode = 'P0002';
  end if;
  if requested_preferred_start < now() + make_interval(mins => workshop_row.minimum_lead_minutes)
    or requested_preferred_start > now() + make_interval(days => workshop_row.booking_horizon_days) then
    raise exception 'Requested time is outside the booking window' using errcode = '23514';
  end if;
  if requested_mobility_requirement = 'pickup' and not workshop_row.offers_pickup
    or requested_mobility_requirement = 'courtesy_car' and not workshop_row.offers_courtesy_car
    or requested_mobility_requirement = 'wait_on_site' and not workshop_row.allows_wait_on_site then
    raise exception 'Requested mobility option is unavailable' using errcode = '23514';
  end if;

  requested_local := requested_preferred_start at time zone workshop_row.time_zone;
  requested_weekday := extract(dow from requested_local)::smallint;
  if extract(minute from requested_local)::integer % workshop_row.slot_interval_minutes <> 0
    or extract(second from requested_local) <> 0 then
    raise exception 'Requested time does not match the workshop slot interval'
      using errcode = '23514';
  end if;
  select hours.opens_at, hours.closes_at into open_time, close_time
  from public.workshop_operating_hours hours
  where hours.workshop_id = workshop_row.id
    and hours.weekday = requested_weekday and not hours.closed;
  if open_time is null or requested_local::time < open_time
    or requested_local::time >= close_time then
    raise exception 'Workshop is closed at the requested time' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.workshop_closures closure
    where closure.workshop_id = workshop_row.id
      and requested_preferred_start >= closure.starts_at
      and requested_preferred_start < closure.ends_at
  ) then
    raise exception 'Workshop is closed at the requested time' using errcode = '23514';
  end if;

  select count(*) into requests_on_day
  from public.service_booking_requests booking
  where booking.workshop_id = requested_workshop_id
    and booking.status in ('requested', 'confirmed')
    and (coalesce(booking.confirmed_start, booking.preferred_start)
      at time zone workshop_row.time_zone)::date = requested_local::date;
  if requests_on_day >= workshop_row.daily_booking_capacity then
    raise exception 'Workshop booking capacity has been reached' using errcode = '23514';
  end if;

  select customer.id into resolved_customer_id
  from public.customer_profiles customer
  where customer.auth_user_id = (select auth.uid());
  if resolved_customer_id is not null then
    select vehicle.id into resolved_vehicle_id
    from public.vehicles vehicle
    where vehicle.customer_id = resolved_customer_id
      and upper(vehicle.registration_number) = upper(btrim(requested_vehicle_registration))
    limit 1;
  end if;

  insert into public.service_booking_requests (
    workshop_id, service_id, customer_id, vehicle_id,
    customer_name, customer_phone, customer_email,
    vehicle_registration, vehicle_make, vehicle_model, vehicle_year, mileage_km,
    preferred_start, alternate_start, customer_note, mobility_requirement,
    locale, management_token_digest
  ) values (
    requested_workshop_id, requested_service_id, resolved_customer_id,
    resolved_vehicle_id, btrim(requested_customer_name),
    btrim(requested_customer_phone), lower(btrim(requested_customer_email)),
    upper(btrim(requested_vehicle_registration)), btrim(requested_vehicle_make),
    btrim(requested_vehicle_model), requested_vehicle_year, requested_mileage_km,
    requested_preferred_start, requested_alternate_start,
    nullif(btrim(requested_customer_note), ''),
    nullif(requested_mobility_requirement, 'none'), requested_locale,
    decode(requested_management_token_digest, 'hex')
  ) returning id into created_request_id;
  return created_request_id;
end;
$$;

create or replace function public.manage_service_booking_request(
  requested_booking_id uuid,
  requested_action text,
  requested_start timestamptz,
  requested_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  manager_id uuid;
  booking_row public.service_booking_requests%rowtype;
  previous_status public.service_booking_status;
  previous_confirmed_start timestamptz;
  normalized_note text := nullif(btrim(requested_note), '');
  history_action public.service_booking_management_action;
begin
  select booking.* into booking_row
  from public.service_booking_requests booking
  where booking.id = requested_booking_id
  for update;
  manager_id := private.current_workshop_manager_id(booking_row.workshop_id);
  if booking_row.id is null or manager_id is null then
    raise exception 'Workshop booking request is unavailable' using errcode = '42501';
  end if;

  previous_status := booking_row.status;
  previous_confirmed_start := booking_row.confirmed_start;
  if requested_action = 'confirm' then
    if booking_row.status <> 'requested' or requested_start is null or requested_start <= now() then
      raise exception 'Only a pending request can be confirmed at a future time' using errcode = '23514';
    end if;
    update public.service_booking_requests set status = 'confirmed',
      confirmed_start = requested_start, workshop_proposed_start = null,
      workshop_proposal_note = null, proposal_updated_at = null,
      workshop_note = coalesce(normalized_note, workshop_note), status_changed_at = now()
    where id = requested_booking_id;
    history_action := 'confirmed';
  elsif requested_action = 'propose_time' then
    if booking_row.status not in ('requested', 'confirmed')
      or requested_start is null or requested_start <= now() then
      raise exception 'A future time can only be proposed for an open request' using errcode = '23514';
    end if;
    update public.service_booking_requests set workshop_proposed_start = requested_start,
      workshop_proposal_note = normalized_note, proposal_updated_at = now(), status_changed_at = now()
    where id = requested_booking_id;
    history_action := 'time_proposed';
  elsif requested_action = 'reschedule' then
    if booking_row.status <> 'confirmed' or requested_start is null or requested_start <= now() then
      raise exception 'Only a confirmed booking can be rescheduled' using errcode = '23514';
    end if;
    update public.service_booking_requests set confirmed_start = requested_start,
      workshop_proposed_start = null, workshop_proposal_note = null,
      proposal_updated_at = null, workshop_note = coalesce(normalized_note, workshop_note),
      status_changed_at = now() where id = requested_booking_id;
    history_action := 'rescheduled';
  elsif requested_action = 'decline' then
    if booking_row.status <> 'requested' or normalized_note is null then
      raise exception 'A pending request and decline reason are required' using errcode = '23514';
    end if;
    update public.service_booking_requests set status = 'declined', confirmed_start = null,
      workshop_proposed_start = null, workshop_proposal_note = null,
      proposal_updated_at = null, workshop_note = normalized_note, status_changed_at = now()
    where id = requested_booking_id;
    history_action := 'declined';
  elsif requested_action = 'cancel' then
    if booking_row.status <> 'confirmed' or normalized_note is null then
      raise exception 'A confirmed booking and cancellation reason are required' using errcode = '23514';
    end if;
    update public.service_booking_requests set status = 'cancelled',
      workshop_proposed_start = null, workshop_proposal_note = null,
      proposal_updated_at = null, workshop_note = normalized_note, status_changed_at = now()
    where id = requested_booking_id;
    history_action := 'cancelled';
  else
    raise exception 'Unsupported workshop booking action' using errcode = '22023';
  end if;

  select booking.* into booking_row from public.service_booking_requests booking
  where booking.id = requested_booking_id;
  insert into public.service_booking_request_history (
    booking_request_id, action, previous_status, new_status,
    previous_confirmed_start, new_confirmed_start, proposed_start,
    note, actor_workshop_manager_id
  ) values (
    requested_booking_id, history_action, previous_status, booking_row.status,
    previous_confirmed_start, booking_row.confirmed_start,
    booking_row.workshop_proposed_start, normalized_note, manager_id
  );
end;
$$;

create or replace function public.get_managed_repair_workflows()
returns table (
  booking_id uuid, workshop_id uuid, workshop_name text, service_name text,
  booking_status public.service_booking_status, customer_name text,
  customer_phone text, customer_email text, vehicle_registration text,
  vehicle_make text, vehicle_model text, vehicle_year integer,
  mileage_km integer, confirmed_start timestamptz, customer_note text,
  workshop_note text, estimate jsonb, history jsonb
)
language sql stable security definer set search_path = ''
as $$
  select booking.id, workshop.id, workshop.display_name, service.name,
    booking.status, booking.customer_name, booking.customer_phone,
    booking.customer_email, booking.vehicle_registration, booking.vehicle_make,
    booking.vehicle_model, booking.vehicle_year, booking.mileage_km,
    booking.confirmed_start, booking.customer_note, booking.workshop_note,
    (
      select jsonb_build_object(
        'id', estimate.id, 'version', estimate.version, 'status', estimate.status,
        'diagnosisSummary', estimate.diagnosis_summary,
        'customerNote', estimate.customer_note, 'currency', estimate.currency,
        'laborCents', estimate.labor_cents, 'partsCents', estimate.parts_cents,
        'otherCents', estimate.other_cents, 'totalCents', estimate.total_cents,
        'sentAt', estimate.sent_at, 'decidedAt', estimate.decided_at,
        'decisionNote', estimate.decision_note,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'type', item.item_type, 'description', item.description,
            'quantity', item.quantity, 'unitPriceCents', item.unit_price_cents,
            'lineTotalCents', item.line_total_cents
          ) order by item.display_order)
          from public.repair_estimate_items item
          where item.estimate_id = estimate.id
        ), '[]'::jsonb)
      )
      from public.repair_estimates estimate
      where estimate.booking_request_id = booking.id
      order by estimate.version desc limit 1
    ),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', history_row.action,
        'previousStatus', history_row.previous_status,
        'newStatus', history_row.new_status,
        'previousConfirmedStart', history_row.previous_confirmed_start,
        'newConfirmedStart', history_row.new_confirmed_start,
        'proposedStart', history_row.proposed_start,
        'note', history_row.note, 'createdAt', history_row.created_at
      ) order by history_row.created_at desc)
      from public.service_booking_request_history history_row
      where history_row.booking_request_id = booking.id
    ), '[]'::jsonb)
  from public.service_booking_requests booking
  join public.workshop_services service
    on service.id = booking.service_id and service.workshop_id = booking.workshop_id
  join public.workshops workshop on workshop.id = booking.workshop_id
  where private.can_manage_automotive_workshop(booking.workshop_id)
    and booking.status in (
      'confirmed', 'checked_in', 'diagnosing', 'awaiting_approval',
      'in_service', 'ready_for_collection', 'completed', 'no_show'
    )
  order by case booking.status
      when 'confirmed' then 0 when 'checked_in' then 1
      when 'diagnosing' then 2 when 'awaiting_approval' then 3
      when 'in_service' then 4 when 'ready_for_collection' then 5 else 6
    end,
    coalesce(booking.confirmed_start, booking.created_at) desc
  limit 250
$$;

create or replace function public.manage_repair_workflow(
  requested_booking_id uuid, requested_action text,
  requested_diagnosis text, requested_items jsonb,
  requested_currency text, requested_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  manager_id uuid;
  booking_row public.service_booking_requests%rowtype;
  previous_status public.service_booking_status;
  previous_confirmed_start timestamptz;
  normalized_diagnosis text := nullif(btrim(requested_diagnosis), '');
  normalized_note text := nullif(btrim(requested_note), '');
  normalized_currency text := upper(btrim(coalesce(requested_currency, 'EUR')));
  history_action public.service_booking_management_action;
  created_estimate_id uuid;
  next_version integer;
  labor_total bigint;
  parts_total bigint;
  other_total bigint;
  latest_estimate public.repair_estimates%rowtype;
begin
  select booking.* into booking_row
  from public.service_booking_requests booking
  where booking.id = requested_booking_id
  for update;
  manager_id := private.current_workshop_manager_id(booking_row.workshop_id);
  if booking_row.id is null or manager_id is null then
    raise exception 'Repair workflow is unavailable' using errcode = '42501';
  end if;
  previous_status := booking_row.status;
  previous_confirmed_start := booking_row.confirmed_start;

  if requested_action = 'check_in' then
    if booking_row.status <> 'confirmed' then
      raise exception 'Only a confirmed booking can be checked in' using errcode = '23514';
    end if;
    update public.service_booking_requests set status = 'checked_in',
      workshop_note = coalesce(normalized_note, workshop_note), status_changed_at = now()
    where id = requested_booking_id;
    history_action := 'checked_in';
  elsif requested_action = 'start_diagnosis' then
    if booking_row.status <> 'checked_in' then
      raise exception 'Only a checked-in vehicle can enter diagnosis' using errcode = '23514';
    end if;
    update public.service_booking_requests set status = 'diagnosing',
      workshop_note = coalesce(normalized_note, workshop_note), status_changed_at = now()
    where id = requested_booking_id;
    history_action := 'diagnosis_recorded';
  elsif requested_action = 'submit_estimate' then
    if booking_row.status <> 'diagnosing'
      or normalized_diagnosis is null or char_length(normalized_diagnosis) < 3
      or requested_items is null or jsonb_typeof(requested_items) <> 'array'
      or jsonb_array_length(requested_items) < 1
      or jsonb_array_length(requested_items) > 100
      or normalized_currency not in ('EUR', 'HUF', 'RON') then
      raise exception 'Diagnosis, currency, and estimate items are required' using errcode = '23514';
    end if;
    if exists (
      select 1
      from jsonb_to_recordset(requested_items) as item(
        type text, description text, quantity numeric, "unitPriceCents" bigint
      )
      where item.type not in ('labor', 'part', 'other')
        or char_length(btrim(coalesce(item.description, ''))) not between 2 and 500
        or item.quantity is null or item.quantity <= 0 or item.quantity > 100000
        or item."unitPriceCents" is null or item."unitPriceCents" < 0
    ) then
      raise exception 'Every estimate item must be valid' using errcode = '23514';
    end if;
    select
      coalesce(sum(round(item.quantity * item."unitPriceCents")) filter (where item.type = 'labor'), 0),
      coalesce(sum(round(item.quantity * item."unitPriceCents")) filter (where item.type = 'part'), 0),
      coalesce(sum(round(item.quantity * item."unitPriceCents")) filter (where item.type = 'other'), 0)
    into labor_total, parts_total, other_total
    from jsonb_to_recordset(requested_items) as item(
      type text, description text, quantity numeric, "unitPriceCents" bigint
    );
    if labor_total + parts_total + other_total <= 0 then
      raise exception 'Estimate total must be positive' using errcode = '23514';
    end if;
    select coalesce(max(estimate.version), 0) + 1 into next_version
    from public.repair_estimates estimate
    where estimate.booking_request_id = requested_booking_id;
    insert into public.repair_estimates (
      booking_request_id, version, diagnosis_summary, customer_note, currency,
      labor_cents, parts_cents, other_cents, created_by_workshop_manager_id
    ) values (
      requested_booking_id, next_version, normalized_diagnosis, normalized_note,
      normalized_currency, labor_total, parts_total, other_total, manager_id
    ) returning id into created_estimate_id;
    insert into public.repair_estimate_items (
      estimate_id, item_type, description, quantity, unit_price_cents,
      line_total_cents, display_order
    )
    select created_estimate_id, item.type::public.repair_estimate_item_type,
      btrim(item.description), item.quantity, item."unitPriceCents",
      round(item.quantity * item."unitPriceCents"), source.ordinality - 1
    from jsonb_array_elements(requested_items) with ordinality
      as source(value, ordinality)
    cross join lateral jsonb_to_record(source.value) as item(
      type text, description text, quantity numeric, "unitPriceCents" bigint
    );
    update public.service_booking_requests set status = 'awaiting_approval',
      workshop_note = coalesce(normalized_note, workshop_note), status_changed_at = now()
    where id = requested_booking_id;
    history_action := 'estimate_sent';
  elsif requested_action = 'start_work' then
    select estimate.* into latest_estimate
    from public.repair_estimates estimate
    where estimate.booking_request_id = requested_booking_id
    order by estimate.version desc limit 1;
    if booking_row.status <> 'awaiting_approval'
      or latest_estimate.id is null or latest_estimate.status <> 'approved' then
      raise exception 'An approved estimate is required before work starts' using errcode = '23514';
    end if;
    update public.service_booking_requests set status = 'in_service',
      workshop_note = coalesce(normalized_note, workshop_note), status_changed_at = now()
    where id = requested_booking_id;
    history_action := 'work_started';
  elsif requested_action = 'ready_for_collection' then
    if booking_row.status <> 'in_service' then
      raise exception 'Only an in-service repair can be marked ready' using errcode = '23514';
    end if;
    update public.service_booking_requests set status = 'ready_for_collection',
      workshop_note = coalesce(normalized_note, workshop_note), status_changed_at = now()
    where id = requested_booking_id;
    history_action := 'ready_for_collection';
  elsif requested_action = 'complete' then
    if booking_row.status <> 'ready_for_collection' then
      raise exception 'Only a ready repair can be completed' using errcode = '23514';
    end if;
    update public.service_booking_requests set status = 'completed',
      workshop_note = coalesce(normalized_note, workshop_note), status_changed_at = now()
    where id = requested_booking_id;
    history_action := 'completed';
  elsif requested_action = 'mark_no_show' then
    if booking_row.status <> 'confirmed' or booking_row.confirmed_start is null
      or booking_row.confirmed_start > now() then
      raise exception 'Only a past confirmed booking can be marked no-show' using errcode = '23514';
    end if;
    update public.service_booking_requests set status = 'no_show',
      workshop_note = coalesce(normalized_note, workshop_note), status_changed_at = now()
    where id = requested_booking_id;
    history_action := 'no_show';
  else
    raise exception 'Unsupported repair workflow action' using errcode = '22023';
  end if;

  select booking.* into booking_row from public.service_booking_requests booking
  where booking.id = requested_booking_id;
  insert into public.service_booking_request_history (
    booking_request_id, action, previous_status, new_status,
    previous_confirmed_start, new_confirmed_start, note,
    actor_workshop_manager_id
  ) values (
    requested_booking_id, history_action, previous_status, booking_row.status,
    previous_confirmed_start, booking_row.confirmed_start,
    normalized_note, manager_id
  );
end;
$$;

comment on function private.is_workshop_publication_eligible(uuid) is
  'Derived public map eligibility: active organisation, publishable location, geocoded details, active primary manager/account, and location billing coverage.';
comment on function private.current_workshop_manager_id(uuid) is
  'Returns the current authenticated manager only when assigned to the exact requested workshop location.';

commit;
