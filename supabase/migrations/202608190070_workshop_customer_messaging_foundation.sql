begin;

alter table public.service_booking_requests
  add column customer_visible_workshop_message text,
  add column internal_workshop_note text,
  add column management_token_expires_at timestamptz;

update public.service_booking_requests
set customer_visible_workshop_message = case
      when status in ('checked_in', 'diagnosing', 'awaiting_approval', 'in_service',
        'ready_for_collection', 'completed', 'no_show') then null
      else workshop_note
    end,
    internal_workshop_note = case
      when status in ('checked_in', 'diagnosing', 'awaiting_approval', 'in_service',
        'ready_for_collection', 'completed', 'no_show') then workshop_note
      else null
    end,
    management_token_expires_at = greatest(created_at + interval '90 days', now() + interval '30 days');

alter table public.service_booking_requests
  alter column management_token_expires_at set default (now() + interval '90 days'),
  alter column management_token_expires_at set not null,
  add constraint service_booking_customer_message_length
    check (customer_visible_workshop_message is null or char_length(customer_visible_workshop_message) <= 2000),
  add constraint service_booking_internal_note_length
    check (internal_workshop_note is null or char_length(internal_workshop_note) <= 4000),
  add constraint service_booking_customer_phone_e164
    check (customer_phone is null or customer_phone ~ '^\+[1-9][0-9]{7,14}$') not valid;

alter table public.service_booking_request_history
  add column actor_access_token boolean not null default false;

alter table public.service_booking_request_history
  drop constraint if exists service_booking_history_single_actor,
  add constraint service_booking_history_single_actor check (
    (actor_workshop_manager_id is not null)::integer
      + (actor_customer_id is not null)::integer
      + actor_access_token::integer <= 1
  );

create type public.booking_communication_audience as enum ('customer', 'workshop');
create type public.booking_communication_channel as enum ('in_app', 'email', 'sms', 'whatsapp');
create type public.booking_communication_delivery_status as enum (
  'pending', 'processing', 'sent', 'failed', 'cancelled'
);

create table public.booking_communication_events (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null references public.service_booking_requests(id) on delete restrict,
  source_history_id uuid references public.service_booking_request_history(id) on delete restrict,
  event_kind text not null check (char_length(event_kind) between 3 and 80),
  audience public.booking_communication_audience not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  unique (source_history_id)
);

create index booking_communication_events_booking_idx
  on public.booking_communication_events(booking_request_id, created_at desc);

create table public.booking_communication_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.booking_communication_events(id) on delete restrict,
  channel public.booking_communication_channel not null,
  destination text not null check (char_length(destination) between 1 and 320),
  status public.booking_communication_delivery_status not null default 'pending',
  scheduled_for timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  provider_message_id text,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 120),
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, channel, destination)
);

create index booking_communication_deliveries_due_idx
  on public.booking_communication_deliveries(status, scheduled_for)
  where status in ('pending', 'failed', 'processing');

create trigger booking_communication_deliveries_updated_at
before update on public.booking_communication_deliveries
for each row execute function public.set_updated_at();

create table public.booking_communication_reads (
  event_id uuid not null references public.booking_communication_events(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (event_id, auth_user_id)
);

alter table public.booking_communication_events enable row level security;
alter table public.booking_communication_deliveries enable row level security;
alter table public.booking_communication_reads enable row level security;
revoke all on table public.booking_communication_events from public, anon, authenticated;
revoke all on table public.booking_communication_deliveries from public, anon, authenticated;
revoke all on table public.booking_communication_reads from public, anon, authenticated;

create function private.separate_service_booking_notes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.workshop_note is distinct from old.workshop_note then
    if new.status in ('checked_in', 'diagnosing', 'awaiting_approval', 'in_service',
      'ready_for_collection', 'completed', 'no_show') then
      new.internal_workshop_note := new.workshop_note;
      new.workshop_note := old.workshop_note;
    else
      new.customer_visible_workshop_message := new.workshop_note;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.separate_service_booking_notes() from public, anon, authenticated;
create trigger service_booking_separate_notes
before update of workshop_note on public.service_booking_requests
for each row execute function private.separate_service_booking_notes();

create function private.queue_booking_communication_from_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_kind text;
  intended_audience public.booking_communication_audience;
  created_event_id uuid;
  booking_row public.service_booking_requests%rowtype;
  workshop_email text;
begin
  event_kind := case new.action::text
    when 'request_received' then 'booking_requested'
    when 'confirmed' then 'booking_confirmed'
    when 'time_proposed' then 'appointment_proposed'
    when 'rescheduled' then 'booking_rescheduled'
    when 'declined' then 'booking_declined'
    when 'cancelled' then 'booking_cancelled'
    when 'proposal_accepted' then 'proposal_accepted'
    when 'proposal_declined' then 'proposal_declined'
    when 'customer_cancelled' then 'customer_cancelled'
    when 'estimate_sent' then 'estimate_ready'
    when 'estimate_approved' then 'estimate_approved'
    when 'estimate_declined' then 'estimate_declined'
    when 'work_started' then 'repair_started'
    when 'ready_for_collection' then 'ready_for_collection'
    when 'completed' then 'repair_completed'
    else null
  end;
  if event_kind is null then return new; end if;

  intended_audience := case when new.action::text in (
    'request_received', 'proposal_accepted', 'proposal_declined',
    'customer_cancelled', 'estimate_approved', 'estimate_declined'
  ) then 'workshop'::public.booking_communication_audience
  else 'customer'::public.booking_communication_audience end;

  select booking.* into booking_row
  from public.service_booking_requests booking where booking.id = new.booking_request_id;
  if new.action::text = 'request_received' and booking_row.booking_source <> 'public_request' then
    return new;
  end if;
  select workshop.public_email into workshop_email
  from public.workshops workshop where workshop.id = booking_row.workshop_id;

  insert into public.booking_communication_events(
    booking_request_id, source_history_id, event_kind, audience, payload, created_at
  ) values (
    new.booking_request_id, new.id, event_kind, intended_audience,
    jsonb_build_object(
      'note', case when new.action::text in (
        'work_started', 'ready_for_collection', 'completed'
      ) then null else new.note end,
      'newStatus', new.new_status,
      'confirmedStart', new.new_confirmed_start,
      'proposedStart', new.proposed_start
    ), new.created_at
  ) returning id into created_event_id;

  insert into public.booking_communication_deliveries(
    event_id, channel, destination, status, sent_at
  ) values (created_event_id, 'in_app', intended_audience::text, 'sent', now());

  if intended_audience = 'customer' and booking_row.customer_email is not null then
    insert into public.booking_communication_deliveries(event_id, channel, destination)
    values (created_event_id, 'email', booking_row.customer_email);
  elsif intended_audience = 'workshop' and workshop_email is not null then
    insert into public.booking_communication_deliveries(event_id, channel, destination)
    values (created_event_id, 'email', workshop_email);
  end if;

  if intended_audience = 'customer'
    and booking_row.customer_phone is not null
    and event_kind in (
      'appointment_proposed', 'booking_rescheduled', 'booking_declined',
      'booking_cancelled', 'estimate_ready'
    ) then
    insert into public.booking_communication_deliveries(event_id, channel, destination)
    values (created_event_id, 'sms', booking_row.customer_phone);
  end if;
  return new;
end;
$$;

revoke all on function private.queue_booking_communication_from_history()
  from public, anon, authenticated;
create trigger service_booking_history_queue_communication
after insert on public.service_booking_request_history
for each row execute function private.queue_booking_communication_from_history();

create function public.get_my_booking_communication_counts()
returns table (booking_id uuid, unread_count bigint, latest_event_kind text, latest_event_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select event.booking_request_id, count(*) filter (
      where not exists (
        select 1 from public.booking_communication_reads reader
        where reader.event_id = event.id and reader.auth_user_id = (select auth.uid())
      )
    ),
    (array_agg(event.event_kind order by event.created_at desc))[1], max(event.created_at)
  from public.booking_communication_events event
  join public.service_booking_requests booking on booking.id = event.booking_request_id
  join public.customer_profiles customer on customer.id = booking.customer_id
  where event.audience = 'customer'
    and customer.auth_user_id = (select auth.uid())
  group by event.booking_request_id
$$;

create function public.get_managed_booking_communication_counts()
returns table (booking_id uuid, unread_count bigint, latest_event_kind text, latest_event_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select event.booking_request_id, count(*) filter (
      where not exists (
        select 1 from public.booking_communication_reads reader
        where reader.event_id = event.id and reader.auth_user_id = (select auth.uid())
      )
    ),
    (array_agg(event.event_kind order by event.created_at desc))[1], max(event.created_at)
  from public.booking_communication_events event
  join public.service_booking_requests booking on booking.id = event.booking_request_id
  where event.audience = 'workshop'
    and private.current_workshop_manager_id(booking.workshop_id) is not null
  group by event.booking_request_id
$$;

create function public.mark_my_booking_communications_read(requested_booking_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.service_booking_requests booking
    join public.customer_profiles customer on customer.id = booking.customer_id
    where booking.id = requested_booking_id and customer.auth_user_id = (select auth.uid())
  ) then raise exception 'Booking unavailable' using errcode = '42501'; end if;
  insert into public.booking_communication_reads(event_id, auth_user_id)
  select event.id, (select auth.uid()) from public.booking_communication_events event
  where event.booking_request_id = requested_booking_id and event.audience = 'customer'
  on conflict (event_id, auth_user_id) do update set read_at = now();
end;
$$;

create function public.mark_managed_booking_communications_read(requested_booking_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare workshop_id uuid;
begin
  select booking.workshop_id into workshop_id from public.service_booking_requests booking
  where booking.id = requested_booking_id;
  if workshop_id is null or private.current_workshop_manager_id(workshop_id) is null then
    raise exception 'Booking unavailable' using errcode = '42501';
  end if;
  insert into public.booking_communication_reads(event_id, auth_user_id)
  select event.id, (select auth.uid()) from public.booking_communication_events event
  where event.booking_request_id = requested_booking_id and event.audience = 'workshop'
  on conflict (event_id, auth_user_id) do update set read_at = now();
end;
$$;

revoke all on function public.get_my_booking_communication_counts() from public, anon, authenticated;
revoke all on function public.get_managed_booking_communication_counts() from public, anon, authenticated;
revoke all on function public.mark_my_booking_communications_read(uuid) from public, anon, authenticated;
revoke all on function public.mark_managed_booking_communications_read(uuid) from public, anon, authenticated;
grant execute on function public.get_my_booking_communication_counts() to authenticated;
grant execute on function public.get_managed_booking_communication_counts() to authenticated;
grant execute on function public.mark_my_booking_communications_read(uuid) to authenticated;
grant execute on function public.mark_managed_booking_communications_read(uuid) to authenticated;

create function public.claim_due_booking_communication_deliveries(
  requested_limit integer default 20, requested_booking_id uuid default null
)
returns table (
  delivery_id uuid, booking_id uuid, event_kind text,
  audience public.booking_communication_audience,
  channel public.booking_communication_channel, destination text,
  locale text, customer_name text, workshop_name text, service_name text,
  vehicle_registration text, confirmed_start timestamptz, proposed_start timestamptz,
  note text, timezone text
)
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  with claimed as (
    select delivery.id
    from public.booking_communication_deliveries delivery
    join public.booking_communication_events event on event.id = delivery.event_id
    where delivery.channel in ('email', 'sms')
      and (delivery.status in ('pending', 'failed')
        or (delivery.status = 'processing' and delivery.claimed_at < now() - interval '10 minutes'))
      and delivery.attempt_count < 5 and delivery.scheduled_for <= now()
      and (requested_booking_id is null or event.booking_request_id = requested_booking_id)
    order by delivery.scheduled_for
    for update of delivery skip locked
    limit greatest(1, least(requested_limit, 100))
  ), updated as (
    update public.booking_communication_deliveries delivery set
      status = 'processing', attempt_count = delivery.attempt_count + 1, claimed_at = now()
    from claimed where delivery.id = claimed.id returning delivery.*
  )
  select updated.id, booking.id, event.event_kind, event.audience,
    updated.channel, updated.destination, booking.locale, booking.customer_name,
    workshop.display_name, service.name, booking.vehicle_registration,
    booking.confirmed_start, booking.workshop_proposed_start,
    event.payload ->> 'note', workshop.time_zone
  from updated
  join public.booking_communication_events event on event.id = updated.event_id
  join public.service_booking_requests booking on booking.id = event.booking_request_id
  join public.workshops workshop on workshop.id = booking.workshop_id
  join public.workshop_services service on service.id = booking.service_id;
end;
$$;

create function public.complete_booking_communication_delivery(
  requested_delivery_id uuid, delivery_succeeded boolean,
  requested_provider_message_id text, requested_error_code text
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.booking_communication_deliveries set
    status = case when delivery_succeeded then 'sent'::public.booking_communication_delivery_status
      else 'failed'::public.booking_communication_delivery_status end,
    provider_message_id = case when delivery_succeeded then nullif(requested_provider_message_id, '') else null end,
    last_error_code = case when delivery_succeeded then null else left(coalesce(requested_error_code, 'provider_error'), 120) end,
    sent_at = case when delivery_succeeded then now() else null end
  where id = requested_delivery_id and status = 'processing';
end;
$$;

revoke all on function public.claim_due_booking_communication_deliveries(integer, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_booking_communication_delivery(uuid, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_due_booking_communication_deliveries(integer, uuid) to service_role;
grant execute on function public.complete_booking_communication_delivery(uuid, boolean, text, text) to service_role;

create function public.get_booking_access_session(requested_token_digest text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare result jsonb;
begin
  if requested_token_digest !~ '^[0-9a-f]{64}$' then return null; end if;
  select jsonb_build_object(
    'id', booking.id, 'status', booking.status, 'workshopName', workshop.display_name,
    'workshopPhone', workshop.public_phone, 'workshopEmail', workshop.public_email,
    'serviceName', service.name, 'serviceCategory', service.category,
    'vehicleRegistration', booking.vehicle_registration,
    'vehicleMake', booking.vehicle_make, 'vehicleModel', booking.vehicle_model,
    'vehicleYear', booking.vehicle_year, 'preferredStart', booking.preferred_start,
    'alternateStart', booking.alternate_start, 'confirmedStart', booking.confirmed_start,
    'proposedStart', booking.workshop_proposed_start,
    'proposalNote', booking.workshop_proposal_note,
    'customerNote', booking.customer_note,
    'workshopMessage', booking.customer_visible_workshop_message,
    'locale', booking.locale, 'accessExpiresAt', booking.management_token_expires_at,
    'canCancel', booking.status in ('requested', 'confirmed') and greatest(
      booking.preferred_start, booking.alternate_start, booking.confirmed_start,
      booking.workshop_proposed_start
    ) > now(),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
      'action', history.action, 'previousStatus', history.previous_status,
      'newStatus', history.new_status, 'confirmedStart', history.new_confirmed_start,
      'proposedStart', history.proposed_start, 'note', case when history.action::text in (
        'checked_in', 'diagnosis_recorded', 'work_started',
        'ready_for_collection', 'completed', 'no_show'
      ) then null else history.note end,
      'createdAt', history.created_at
    ) order by history.created_at desc) from public.service_booking_request_history history
      where history.booking_request_id = booking.id), '[]'::jsonb),
    'estimate', (select jsonb_build_object(
      'id', estimate.id, 'version', estimate.version, 'status', estimate.status,
      'diagnosisSummary', estimate.diagnosis_summary, 'customerNote', estimate.customer_note,
      'currency', estimate.currency, 'totalCents', estimate.total_cents,
      'decisionNote', estimate.decision_note,
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'type', item.item_type, 'description', item.description, 'quantity', item.quantity,
        'unitPriceCents', item.unit_price_cents, 'lineTotalCents', item.line_total_cents
      ) order by item.display_order) from public.repair_estimate_items item
        where item.estimate_id = estimate.id), '[]'::jsonb)
    ) from public.repair_estimates estimate where estimate.booking_request_id = booking.id
      order by estimate.version desc limit 1)
  ) into result
  from public.service_booking_requests booking
  join public.workshops workshop on workshop.id = booking.workshop_id
  join public.workshop_services service on service.id = booking.service_id
  where booking.management_token_digest = decode(requested_token_digest, 'hex')
    and booking.management_token_expires_at > now();
  return result;
end;
$$;

create function public.manage_booking_with_access_token(
  requested_token_digest text, requested_action text, requested_note text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare booking_row public.service_booking_requests%rowtype;
  previous_status public.service_booking_status; accepted_start timestamptz;
  normalized_note text := nullif(btrim(requested_note), '');
  history_action public.service_booking_management_action;
begin
  if requested_token_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'Booking access unavailable' using errcode = '42501';
  end if;
  select booking.* into booking_row from public.service_booking_requests booking
  where booking.management_token_digest = decode(requested_token_digest, 'hex')
    and booking.management_token_expires_at > now() for update;
  if booking_row.id is null then raise exception 'Booking access unavailable' using errcode = '42501'; end if;
  previous_status := booking_row.status;
  if requested_action = 'accept_proposal' then
    accepted_start := booking_row.workshop_proposed_start;
    if booking_row.status not in ('requested', 'confirmed') or accepted_start is null or accepted_start <= now() then
      raise exception 'Current proposal required' using errcode = '23514'; end if;
    update public.service_booking_requests set status = 'confirmed', confirmed_start = accepted_start,
      workshop_proposed_start = null, workshop_proposal_note = null, proposal_updated_at = null,
      status_changed_at = now() where id = booking_row.id;
    history_action := 'proposal_accepted';
  elsif requested_action = 'decline_proposal' then
    accepted_start := booking_row.workshop_proposed_start;
    if booking_row.status not in ('requested', 'confirmed') or accepted_start is null then
      raise exception 'Current proposal required' using errcode = '23514'; end if;
    update public.service_booking_requests set workshop_proposed_start = null,
      workshop_proposal_note = null, proposal_updated_at = null, status_changed_at = now()
      where id = booking_row.id;
    history_action := 'proposal_declined';
  elsif requested_action = 'cancel' then
    if booking_row.status not in ('requested', 'confirmed') or normalized_note is null
      or greatest(booking_row.preferred_start, booking_row.alternate_start,
        booking_row.confirmed_start, booking_row.workshop_proposed_start) <= now() then
      raise exception 'Open future booking and reason required' using errcode = '23514'; end if;
    update public.service_booking_requests set status = 'cancelled',
      workshop_proposed_start = null, workshop_proposal_note = null,
      proposal_updated_at = null, status_changed_at = now() where id = booking_row.id;
    history_action := 'customer_cancelled';
  else raise exception 'Unsupported action' using errcode = '22023'; end if;
  insert into public.service_booking_request_history(
    booking_request_id, action, previous_status, new_status,
    previous_confirmed_start, new_confirmed_start, proposed_start,
    note, actor_access_token
  ) select booking_row.id, history_action, previous_status, booking.status,
    booking_row.confirmed_start, booking.confirmed_start, accepted_start,
    normalized_note, true from public.service_booking_requests booking where booking.id = booking_row.id;
  return booking_row.id;
end;
$$;

create function public.decide_estimate_with_access_token(
  requested_token_digest text, requested_estimate_id uuid,
  requested_decision text, requested_note text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare booking_row public.service_booking_requests%rowtype;
  estimate_row public.repair_estimates%rowtype;
  normalized_note text := nullif(btrim(requested_note), '');
  history_action public.service_booking_management_action;
begin
  if requested_token_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'Booking access unavailable' using errcode = '42501'; end if;
  select booking.* into booking_row
  from public.service_booking_requests booking
  where booking.management_token_digest = decode(requested_token_digest, 'hex')
    and booking.management_token_expires_at > now()
  for update;
  if booking_row.id is null then
    raise exception 'Estimate decision unavailable' using errcode = '23514';
  end if;
  select estimate.* into estimate_row
  from public.repair_estimates estimate
  where estimate.booking_request_id = booking_row.id and estimate.id = requested_estimate_id
  for update;
  if booking_row.id is null or estimate_row.status <> 'awaiting_customer'
    or booking_row.status <> 'awaiting_approval' then
    raise exception 'Estimate decision unavailable' using errcode = '23514'; end if;
  if requested_decision = 'approve' then
    update public.repair_estimates set status = 'approved', decided_at = now(),
      decision_note = normalized_note where id = estimate_row.id;
    history_action := 'estimate_approved';
  elsif requested_decision = 'decline' then
    update public.repair_estimates set status = 'declined', decided_at = now(),
      decision_note = normalized_note where id = estimate_row.id;
    update public.service_booking_requests set status = 'diagnosing', status_changed_at = now()
      where id = booking_row.id;
    history_action := 'estimate_declined';
  else raise exception 'Unsupported decision' using errcode = '22023'; end if;
  insert into public.service_booking_request_history(
    booking_request_id, action, previous_status, new_status,
    previous_confirmed_start, new_confirmed_start, note, actor_access_token
  ) select booking_row.id, history_action, 'awaiting_approval', booking.status,
    booking.confirmed_start, booking.confirmed_start, normalized_note, true
  from public.service_booking_requests booking where booking.id = booking_row.id;
  return booking_row.id;
end;
$$;

revoke all on function public.get_booking_access_session(text) from public, anon, authenticated;
revoke all on function public.manage_booking_with_access_token(text, text, text) from public, anon, authenticated;
revoke all on function public.decide_estimate_with_access_token(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.get_booking_access_session(text) to service_role;
grant execute on function public.manage_booking_with_access_token(text, text, text) to service_role;
grant execute on function public.decide_estimate_with_access_token(text, uuid, text, text) to service_role;

create or replace function public.get_my_service_booking_requests()
returns table (
  booking_id uuid, workshop_id uuid, workshop_name text,
  workshop_phone text, workshop_email text, workshop_city text,
  workshop_address text, service_name text, service_category text,
  booking_status public.service_booking_status,
  vehicle_registration text, vehicle_make text, vehicle_model text,
  vehicle_year integer, preferred_start timestamptz,
  alternate_start timestamptz, confirmed_start timestamptz,
  proposed_start timestamptz, proposal_note text, customer_note text,
  workshop_note text, created_at timestamptz, can_cancel boolean, history jsonb
)
language sql stable security definer set search_path = ''
as $$
  select booking.id, workshop.id, workshop.display_name,
    workshop.public_phone, workshop.public_email, workshop.city,
    workshop.address, service.name, service.category, booking.status,
    booking.vehicle_registration, booking.vehicle_make, booking.vehicle_model,
    booking.vehicle_year, booking.preferred_start, booking.alternate_start,
    booking.confirmed_start, booking.workshop_proposed_start,
    booking.workshop_proposal_note, booking.customer_note,
    booking.customer_visible_workshop_message,
    booking.created_at,
    booking.status in ('requested', 'confirmed') and greatest(
      booking.preferred_start, booking.alternate_start,
      booking.confirmed_start, booking.workshop_proposed_start
    ) > now(),
    coalesce((select jsonb_agg(jsonb_build_object(
      'action', history.action, 'previousStatus', history.previous_status,
      'newStatus', history.new_status,
      'previousConfirmedStart', history.previous_confirmed_start,
      'newConfirmedStart', history.new_confirmed_start,
      'proposedStart', history.proposed_start,
      'note', case when history.action::text in (
        'checked_in', 'diagnosis_recorded', 'work_started',
        'ready_for_collection', 'completed', 'no_show'
      ) then null else history.note end,
      'createdAt', history.created_at
    ) order by history.created_at desc)
    from public.service_booking_request_history history
    where history.booking_request_id = booking.id), '[]'::jsonb)
  from public.service_booking_requests booking
  join public.customer_profiles customer on customer.id = booking.customer_id
  join public.workshop_services service
    on service.id = booking.service_id and service.workshop_id = booking.workshop_id
  join public.workshops workshop on workshop.id = booking.workshop_id
  where customer.auth_user_id = (select auth.uid())
  order by case booking.status when 'requested' then 0 when 'confirmed' then 1 else 2 end,
    coalesce(booking.confirmed_start, booking.preferred_start) desc,
    booking.created_at desc
  limit 250
$$;

create function public.get_managed_booking_internal_notes()
returns table (booking_id uuid, internal_note text)
language sql stable security definer set search_path = ''
as $$
  select booking.id, booking.internal_workshop_note
  from public.service_booking_requests booking
  where private.current_workshop_manager_id(booking.workshop_id) is not null
$$;

revoke all on function public.get_managed_booking_internal_notes() from public, anon, authenticated;
grant execute on function public.get_managed_booking_internal_notes() to authenticated;

create function public.get_admin_booking_communication_summary()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case when private.is_active_platform_admin() then jsonb_build_object(
    'pending', count(*) filter (where status in ('pending', 'processing')),
    'retryable', count(*) filter (where status = 'failed' and attempt_count < 5),
    'exhausted', count(*) filter (where status = 'failed' and attempt_count >= 5),
    'sent', count(*) filter (where status = 'sent')
  ) else null end from public.booking_communication_deliveries
  where channel in ('email', 'sms', 'whatsapp')
$$;

revoke all on function public.get_admin_booking_communication_summary() from public, anon, authenticated;
grant execute on function public.get_admin_booking_communication_summary() to authenticated;

create or replace function private.ensure_completed_vehicle_service_record()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare latest_estimate public.repair_estimates%rowtype; service_name text;
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    select estimate.* into latest_estimate from public.repair_estimates estimate
    where estimate.booking_request_id = new.id and estimate.status = 'approved'
    order by estimate.version desc limit 1;
    select service.name into service_name from public.workshop_services service where service.id = new.service_id;
    insert into public.vehicle_service_records(
      booking_request_id, vehicle_id, customer_id, completed_mileage_km,
      work_summary, invoice_total_cents, invoice_currency
    ) values (
      new.id, new.vehicle_id, new.customer_id, new.mileage_km,
      service_name, latest_estimate.total_cents, latest_estimate.currency
    ) on conflict (booking_request_id) do nothing;
    if new.vehicle_id is not null and new.mileage_km is not null then
      update public.vehicles set current_mileage_km = greatest(coalesce(current_mileage_km, 0), new.mileage_km)
      where id = new.vehicle_id;
    end if;
  end if;
  return new;
end;
$$;

comment on table public.booking_communication_events is
  'Channel-neutral, immutable workshop-customer communication events derived from booking history.';
comment on table public.booking_communication_deliveries is
  'Per-channel delivery outbox with retry and exhausted-failure state; WhatsApp is reserved for Phase 8.';
comment on column public.service_booking_requests.internal_workshop_note is
  'Workshop-only operational note. It is never returned through customer booking access.';
comment on column public.service_booking_requests.customer_visible_workshop_message is
  'The current customer-visible workshop message; immutable action history retains earlier messages.';

commit;
