begin;

create type public.repair_estimate_status as enum (
  'awaiting_customer', 'approved', 'declined', 'superseded'
);

create type public.repair_estimate_item_type as enum (
  'labor', 'part', 'other'
);

create table public.repair_estimates (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null
    references public.service_booking_requests(id) on delete restrict,
  version integer not null check (version > 0),
  status public.repair_estimate_status not null default 'awaiting_customer',
  diagnosis_summary text not null
    check (char_length(btrim(diagnosis_summary)) between 3 and 4000),
  customer_note text check (customer_note is null or char_length(customer_note) <= 2000),
  currency char(3) not null default 'EUR'
    check (currency in ('EUR', 'HUF', 'RON')),
  labor_cents bigint not null check (labor_cents >= 0),
  parts_cents bigint not null check (parts_cents >= 0),
  other_cents bigint not null check (other_cents >= 0),
  total_cents bigint generated always as
    (labor_cents + parts_cents + other_cents) stored,
  created_by_workshop_manager_id uuid not null
    references public.workshop_manager_profiles(id) on delete restrict,
  sent_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by_customer_id uuid
    references public.customer_profiles(id) on delete restrict,
  decision_note text check (decision_note is null or char_length(decision_note) <= 2000),
  created_at timestamptz not null default now(),
  unique (booking_request_id, version),
  check (total_cents > 0),
  check (
    (status in ('awaiting_customer', 'superseded') and decided_at is null and decided_by_customer_id is null)
    or (status in ('approved', 'declined') and decided_at is not null and decided_by_customer_id is not null)
  )
);

create unique index repair_estimates_one_open_idx
  on public.repair_estimates(booking_request_id)
  where status = 'awaiting_customer';

create index repair_estimates_booking_idx
  on public.repair_estimates(booking_request_id, version desc);

create table public.repair_estimate_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.repair_estimates(id) on delete restrict,
  item_type public.repair_estimate_item_type not null,
  description text not null check (char_length(btrim(description)) between 2 and 500),
  quantity numeric(10, 2) not null check (quantity > 0 and quantity <= 100000),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),
  display_order integer not null check (display_order between 0 and 99),
  check (line_total_cents = round(quantity * unit_price_cents))
);

create index repair_estimate_items_estimate_idx
  on public.repair_estimate_items(estimate_id, display_order);

alter table public.repair_estimates enable row level security;
alter table public.repair_estimate_items enable row level security;
revoke all on table public.repair_estimates, public.repair_estimate_items
  from public, anon, authenticated;

create function private.prevent_repair_estimate_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Repair estimate records are immutable'
    using errcode = '42501';
end;
$$;

revoke all on function private.prevent_repair_estimate_mutation()
  from public, anon, authenticated;

create trigger repair_estimate_items_immutable
before update or delete on public.repair_estimate_items
for each row execute function private.prevent_repair_estimate_mutation();

create function public.get_managed_repair_workflows()
returns table (
  booking_id uuid,
  workshop_id uuid,
  workshop_name text,
  service_name text,
  booking_status public.service_booking_status,
  customer_name text,
  customer_phone text,
  customer_email text,
  vehicle_registration text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year integer,
  mileage_km integer,
  confirmed_start timestamptz,
  customer_note text,
  workshop_note text,
  estimate jsonb,
  history jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select booking.id, workshop.id, workshop.display_name, service.name,
    booking.status, booking.customer_name, booking.customer_phone,
    booking.customer_email, booking.vehicle_registration, booking.vehicle_make,
    booking.vehicle_model, booking.vehicle_year, booking.mileage_km,
    booking.confirmed_start, booking.customer_note, booking.workshop_note,
    (
      select jsonb_build_object(
        'id', estimate.id,
        'version', estimate.version,
        'status', estimate.status,
        'diagnosisSummary', estimate.diagnosis_summary,
        'customerNote', estimate.customer_note,
        'currency', estimate.currency,
        'laborCents', estimate.labor_cents,
        'partsCents', estimate.parts_cents,
        'otherCents', estimate.other_cents,
        'totalCents', estimate.total_cents,
        'sentAt', estimate.sent_at,
        'decidedAt', estimate.decided_at,
        'decisionNote', estimate.decision_note,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'type', item.item_type,
            'description', item.description,
            'quantity', item.quantity,
            'unitPriceCents', item.unit_price_cents,
            'lineTotalCents', item.line_total_cents
          ) order by item.display_order)
          from public.repair_estimate_items item
          where item.estimate_id = estimate.id
        ), '[]'::jsonb)
      )
      from public.repair_estimates estimate
      where estimate.booking_request_id = booking.id
      order by estimate.version desc
      limit 1
    ),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', history_row.action,
        'previousStatus', history_row.previous_status,
        'newStatus', history_row.new_status,
        'previousConfirmedStart', history_row.previous_confirmed_start,
        'newConfirmedStart', history_row.new_confirmed_start,
        'proposedStart', history_row.proposed_start,
        'note', history_row.note,
        'createdAt', history_row.created_at
      ) order by history_row.created_at desc)
      from public.service_booking_request_history history_row
      where history_row.booking_request_id = booking.id
    ), '[]'::jsonb)
  from public.service_booking_requests booking
  join public.workshop_services service on service.id = booking.service_id
  join public.workshops workshop
    on workshop.legacy_workshop_profile_id = booking.workshop_id
  join public.service_providers provider
    on provider.id = workshop.service_provider_id and provider.status = 'active'
  join public.workshop_manager_memberships membership
    on membership.service_provider_id = provider.id
    and membership.status = 'active'
    and membership.membership_role in ('owner', 'manager')
  join public.workshop_manager_profiles manager
    on manager.id = membership.workshop_manager_id and manager.status = 'active'
  where manager.auth_user_id = (select auth.uid())
    and booking.status in (
      'confirmed', 'checked_in', 'diagnosing', 'awaiting_approval',
      'in_service', 'ready_for_collection', 'completed', 'no_show'
    )
  order by
    case booking.status
      when 'confirmed' then 0
      when 'checked_in' then 1
      when 'diagnosing' then 2
      when 'awaiting_approval' then 3
      when 'in_service' then 4
      when 'ready_for_collection' then 5
      else 6
    end,
    coalesce(booking.confirmed_start, booking.created_at) desc
  limit 250
$$;

revoke all on function public.get_managed_repair_workflows()
  from public, anon, authenticated;
grant execute on function public.get_managed_repair_workflows()
  to authenticated;

create function public.manage_repair_workflow(
  requested_booking_id uuid,
  requested_action text,
  requested_diagnosis text,
  requested_items jsonb,
  requested_currency text,
  requested_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  authorized record;
  manager_id uuid;
  booking_row public.service_booking_requests%rowtype;
  previous_status public.service_booking_status;
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
  select booking as booking_record, manager.id as manager_id
  into authorized
  from public.service_booking_requests booking
  join public.workshops workshop
    on workshop.legacy_workshop_profile_id = booking.workshop_id
  join public.service_providers provider
    on provider.id = workshop.service_provider_id and provider.status = 'active'
  join public.workshop_manager_memberships membership
    on membership.service_provider_id = provider.id
    and membership.status = 'active'
    and membership.membership_role in ('owner', 'manager')
  join public.workshop_manager_profiles manager
    on manager.id = membership.workshop_manager_id and manager.status = 'active'
  where booking.id = requested_booking_id
    and manager.auth_user_id = (select auth.uid())
  limit 1
  for update of booking;

  booking_row := authorized.booking_record;
  manager_id := authorized.manager_id;
  if booking_row.id is null or manager_id is null then
    raise exception 'Repair workflow is unavailable' using errcode = '42501';
  end if;
  previous_status := booking_row.status;

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
      or normalized_diagnosis is null
      or char_length(normalized_diagnosis) < 3
      or requested_items is null
      or jsonb_typeof(requested_items) <> 'array'
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
      or latest_estimate.id is null
      or latest_estimate.status <> 'approved' then
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
    if booking_row.status <> 'confirmed'
      or booking_row.confirmed_start is null
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

  select booking.* into booking_row
  from public.service_booking_requests booking where booking.id = requested_booking_id;
  insert into public.service_booking_request_history (
    booking_request_id, action, previous_status, new_status,
    previous_confirmed_start, new_confirmed_start, note,
    actor_workshop_manager_id
  ) values (
    requested_booking_id, history_action, previous_status, booking_row.status,
    booking_row.confirmed_start, booking_row.confirmed_start,
    normalized_note, manager_id
  );
end;
$$;

revoke all on function public.manage_repair_workflow(uuid, text, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.manage_repair_workflow(uuid, text, text, jsonb, text, text)
  to authenticated;

create function public.get_my_repair_estimates()
returns table (booking_id uuid, estimate jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select booking.id,
    jsonb_build_object(
      'id', estimate.id,
      'version', estimate.version,
      'status', estimate.status,
      'diagnosisSummary', estimate.diagnosis_summary,
      'customerNote', estimate.customer_note,
      'currency', estimate.currency,
      'laborCents', estimate.labor_cents,
      'partsCents', estimate.parts_cents,
      'otherCents', estimate.other_cents,
      'totalCents', estimate.total_cents,
      'sentAt', estimate.sent_at,
      'decidedAt', estimate.decided_at,
      'decisionNote', estimate.decision_note,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'type', item.item_type,
          'description', item.description,
          'quantity', item.quantity,
          'unitPriceCents', item.unit_price_cents,
          'lineTotalCents', item.line_total_cents
        ) order by item.display_order)
        from public.repair_estimate_items item
        where item.estimate_id = estimate.id
      ), '[]'::jsonb)
    )
  from public.service_booking_requests booking
  join public.customer_profiles customer on customer.id = booking.customer_id
  join lateral (
    select candidate.* from public.repair_estimates candidate
    where candidate.booking_request_id = booking.id
    order by candidate.version desc limit 1
  ) estimate on true
  where customer.auth_user_id = (select auth.uid())
  order by estimate.sent_at desc
$$;

revoke all on function public.get_my_repair_estimates()
  from public, anon, authenticated;
grant execute on function public.get_my_repair_estimates()
  to authenticated;

create function public.decide_my_repair_estimate(
  requested_estimate_id uuid,
  requested_decision text,
  requested_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  authorized record;
  estimate_row public.repair_estimates%rowtype;
  booking_row public.service_booking_requests%rowtype;
  customer_id uuid;
  normalized_note text := nullif(btrim(requested_note), '');
  history_action public.service_booking_management_action;
begin
  select estimate as estimate_record, booking as booking_record,
    customer.id as customer_id
  into authorized
  from public.repair_estimates estimate
  join public.service_booking_requests booking
    on booking.id = estimate.booking_request_id
  join public.customer_profiles customer on customer.id = booking.customer_id
  where estimate.id = requested_estimate_id
    and customer.auth_user_id = (select auth.uid())
  limit 1
  for update of estimate, booking;

  estimate_row := authorized.estimate_record;
  booking_row := authorized.booking_record;
  customer_id := authorized.customer_id;
  if estimate_row.id is null or booking_row.id is null or customer_id is null then
    raise exception 'Repair estimate is unavailable' using errcode = '42501';
  end if;
  if estimate_row.status <> 'awaiting_customer'
    or booking_row.status <> 'awaiting_approval' then
    raise exception 'This repair estimate is no longer awaiting a decision'
      using errcode = '23514';
  end if;

  if requested_decision = 'approve' then
    update public.repair_estimates set status = 'approved', decided_at = now(),
      decided_by_customer_id = customer_id, decision_note = normalized_note
    where id = requested_estimate_id;
    history_action := 'estimate_approved';
  elsif requested_decision = 'decline' then
    update public.repair_estimates set status = 'declined', decided_at = now(),
      decided_by_customer_id = customer_id, decision_note = normalized_note
    where id = requested_estimate_id;
    update public.service_booking_requests set status = 'diagnosing',
      status_changed_at = now() where id = booking_row.id;
    history_action := 'estimate_declined';
  else
    raise exception 'Unsupported estimate decision' using errcode = '22023';
  end if;

  select booking.* into booking_row from public.service_booking_requests booking
  where booking.id = estimate_row.booking_request_id;
  insert into public.service_booking_request_history (
    booking_request_id, action, previous_status, new_status,
    previous_confirmed_start, new_confirmed_start, note, actor_customer_id
  ) values (
    booking_row.id, history_action, 'awaiting_approval', booking_row.status,
    booking_row.confirmed_start, booking_row.confirmed_start,
    normalized_note, customer_id
  );
end;
$$;

revoke all on function public.decide_my_repair_estimate(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.decide_my_repair_estimate(uuid, text, text)
  to authenticated;

comment on table public.repair_estimates is
  'Versioned customer-facing repair estimates; mutations are restricted to lifecycle RPCs.';
comment on table public.repair_estimate_items is
  'Immutable itemized labor, part, and other charges belonging to a repair estimate.';

commit;
