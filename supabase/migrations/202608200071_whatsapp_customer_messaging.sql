begin;

alter table public.service_booking_requests
  add column whatsapp_opt_in_at timestamptz,
  add column whatsapp_opt_out_at timestamptz,
  add column whatsapp_opt_in_source text,
  add column whatsapp_last_inbound_at timestamptz,
  add column whatsapp_customer_wa_id text,
  add constraint service_booking_whatsapp_source check (
    whatsapp_opt_in_source is null or whatsapp_opt_in_source in (
      'public_request', 'customer_account', 'booking_access', 'customer_message'
    )
  ),
  add constraint service_booking_whatsapp_wa_id check (
    whatsapp_customer_wa_id is null or whatsapp_customer_wa_id ~ '^[1-9][0-9]{7,14}$'
  );

alter table public.booking_communication_deliveries
  add column message_mode text,
  add column message_body text,
  add column provider_status text,
  add column delivered_at timestamptz,
  add column read_at timestamptz,
  add constraint booking_communication_message_mode check (
    message_mode is null or message_mode in ('template', 'session_text')
  ),
  add constraint booking_communication_message_body_length check (
    message_body is null or char_length(message_body) between 1 and 4096
  ),
  add constraint booking_communication_provider_status check (
    provider_status is null or provider_status in (
      'accepted', 'sent', 'delivered', 'read', 'failed', 'deleted'
    )
  );

alter table public.booking_communication_events
  add column source_service_notification_id uuid unique
    references public.service_booking_notifications(id) on delete restrict;

create unique index booking_communication_provider_message_idx
  on public.booking_communication_deliveries(provider_message_id)
  where provider_message_id is not null;

create table public.booking_whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null
    references public.service_booking_requests(id) on delete restrict,
  delivery_id uuid unique
    references public.booking_communication_deliveries(id) on delete restrict,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null check (char_length(body) between 1 and 4096),
  provider_message_id text unique,
  sender_auth_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index booking_whatsapp_messages_booking_idx
  on public.booking_whatsapp_messages(booking_request_id, occurred_at desc);

alter table public.booking_whatsapp_messages enable row level security;
revoke all on table public.booking_whatsapp_messages from public, anon, authenticated;

create function private.booking_whatsapp_enabled(
  booking public.service_booking_requests
)
returns boolean language sql immutable set search_path = ''
as $$
  select booking.customer_phone is not null
    and booking.whatsapp_opt_in_at is not null
    and (booking.whatsapp_opt_out_at is null
      or booking.whatsapp_opt_in_at > booking.whatsapp_opt_out_at)
$$;

revoke all on function private.booking_whatsapp_enabled(public.service_booking_requests)
  from public, anon, authenticated;

create function private.route_service_notification_by_preference()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare booking_row public.service_booking_requests%rowtype;
  event_id uuid; event_kind text;
begin
  select booking.* into booking_row from public.service_booking_requests booking
  where booking.id = new.booking_request_id;
  if booking_row.id is null or not private.booking_whatsapp_enabled(booking_row) then
    return new;
  end if;
  event_kind := case new.kind::text
    when 'reminder_24h' then 'appointment_reminder'
    when 'review_request' then 'review_request'
    else null
  end;
  if event_kind is not null then
    insert into public.booking_communication_events(
      booking_request_id, source_service_notification_id,
      event_kind, audience, payload
    ) values (
      booking_row.id, new.id, event_kind, 'customer',
      jsonb_build_object('confirmedStart', booking_row.confirmed_start)
    )
    on conflict (source_service_notification_id) do update set
      payload = excluded.payload
    returning id into event_id;
    insert into public.booking_communication_deliveries(
      event_id, channel, destination, scheduled_for, message_mode
    ) values (
      event_id, 'whatsapp', booking_row.customer_phone,
      new.scheduled_for, 'template'
    ) on conflict (event_id, channel, destination) do update set
      scheduled_for = excluded.scheduled_for, status = 'pending',
      attempt_count = 0, claimed_at = null, provider_message_id = null,
      provider_status = null, last_error_code = null, sent_at = null,
      delivered_at = null, read_at = null;
  end if;
  update public.service_booking_notifications set status = 'cancelled'
  where id = new.id and status <> 'sent';
  return new;
end;
$$;

revoke all on function private.route_service_notification_by_preference()
  from public, anon, authenticated;
create trigger service_notification_route_by_preference
after insert or update of scheduled_for, destination_phone
on public.service_booking_notifications
for each row execute function private.route_service_notification_by_preference();

create or replace function private.queue_booking_communication_from_history()
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
    and private.booking_whatsapp_enabled(booking_row)
    and event_kind <> 'repair_completed' then
    insert into public.booking_communication_deliveries(
      event_id, channel, destination, message_mode
    ) values (created_event_id, 'whatsapp', booking_row.customer_phone, 'template');
  elsif intended_audience = 'customer'
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

create function private.apply_booking_whatsapp_preference(
  requested_booking_id uuid, requested_enabled boolean, requested_source text
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if requested_source not in ('public_request', 'customer_account', 'booking_access', 'customer_message') then
    raise exception 'Invalid WhatsApp preference source' using errcode = '22023';
  end if;
  if requested_enabled then
    update public.service_booking_requests set
      whatsapp_opt_in_at = now(), whatsapp_opt_out_at = null,
      whatsapp_opt_in_source = requested_source
    where id = requested_booking_id and customer_phone is not null;
    if not found then raise exception 'A customer phone is required' using errcode = '23514'; end if;
    update public.service_booking_notifications set scheduled_for = scheduled_for
    where booking_request_id = requested_booking_id
      and status in ('pending', 'processing', 'failed', 'cancelled');
    update public.service_booking_notifications set status = 'cancelled'
    where booking_request_id = requested_booking_id
      and status in ('pending', 'processing', 'failed');
    update public.booking_communication_deliveries delivery set status = 'cancelled'
    from public.booking_communication_events event
    where delivery.event_id = event.id and event.booking_request_id = requested_booking_id
      and delivery.channel = 'sms' and delivery.status in ('pending', 'processing', 'failed');
  else
    update public.service_booking_requests set whatsapp_opt_out_at = now()
    where id = requested_booking_id;
    update public.booking_communication_deliveries delivery set status = 'cancelled'
    from public.booking_communication_events event
    where delivery.event_id = event.id and event.booking_request_id = requested_booking_id
      and delivery.channel = 'whatsapp' and delivery.status in ('pending', 'processing', 'failed');
    update public.service_booking_notifications notification set
      status = 'pending', attempt_count = 0, claimed_at = null,
      provider_message_id = null, last_error_code = null, sent_at = null
    where notification.booking_request_id = requested_booking_id
      and notification.kind = 'reminder_24h'
      and notification.scheduled_for > now() and notification.status = 'cancelled';
  end if;
end;
$$;

revoke all on function private.apply_booking_whatsapp_preference(uuid, boolean, text)
  from public, anon, authenticated;

create function public.create_public_service_booking_request_v3(
  requested_workshop_id uuid, requested_service_id uuid,
  requested_customer_name text, requested_customer_phone text,
  requested_customer_email text, requested_vehicle_registration text,
  requested_vehicle_make text, requested_vehicle_model text,
  requested_vehicle_year integer, requested_vehicle_vin text,
  requested_mileage_km integer, requested_preferred_start timestamptz,
  requested_alternate_start timestamptz, requested_customer_note text,
  requested_mobility_requirement text, requested_locale text,
  requested_management_token_digest text, requested_whatsapp_opt_in boolean
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare created_booking_id uuid;
begin
  created_booking_id := public.create_public_service_booking_request_v2(
    requested_workshop_id, requested_service_id, requested_customer_name,
    requested_customer_phone, requested_customer_email,
    requested_vehicle_registration, requested_vehicle_make, requested_vehicle_model,
    requested_vehicle_year, requested_vehicle_vin, requested_mileage_km,
    requested_preferred_start, requested_alternate_start, requested_customer_note,
    requested_mobility_requirement, requested_locale, requested_management_token_digest
  );
  if requested_whatsapp_opt_in then
    perform private.apply_booking_whatsapp_preference(
      created_booking_id, true, 'public_request'
    );
  end if;
  return created_booking_id;
end;
$$;

revoke all on function public.create_public_service_booking_request_v3(
  uuid, uuid, text, text, text, text, text, text, integer, text, integer,
  timestamptz, timestamptz, text, text, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.create_public_service_booking_request_v3(
  uuid, uuid, text, text, text, text, text, text, integer, text, integer,
  timestamptz, timestamptz, text, text, text, text, boolean
) to anon, authenticated;

create function public.set_my_booking_whatsapp_preference(
  requested_booking_id uuid, requested_enabled boolean
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.service_booking_requests booking
    join public.customer_profiles customer on customer.id = booking.customer_id
    where booking.id = requested_booking_id and customer.auth_user_id = (select auth.uid())
  ) then raise exception 'Booking unavailable' using errcode = '42501'; end if;
  perform private.apply_booking_whatsapp_preference(
    requested_booking_id, requested_enabled, 'customer_account'
  );
end;
$$;

create function public.set_booking_whatsapp_preference_with_access_token(
  requested_token_digest text, requested_enabled boolean
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare booking_id uuid;
begin
  if requested_token_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'Booking access unavailable' using errcode = '42501'; end if;
  select booking.id into booking_id from public.service_booking_requests booking
  where booking.management_token_digest = decode(requested_token_digest, 'hex')
    and booking.management_token_expires_at > now() for update;
  if booking_id is null then raise exception 'Booking access unavailable' using errcode = '42501'; end if;
  perform private.apply_booking_whatsapp_preference(
    booking_id, requested_enabled, 'booking_access'
  );
  return booking_id;
end;
$$;

revoke all on function public.set_my_booking_whatsapp_preference(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.set_booking_whatsapp_preference_with_access_token(text, boolean)
  from public, anon, authenticated;
grant execute on function public.set_my_booking_whatsapp_preference(uuid, boolean)
  to authenticated;
grant execute on function public.set_booking_whatsapp_preference_with_access_token(text, boolean)
  to service_role;

create function public.get_my_booking_whatsapp_state()
returns table (
  booking_id uuid, opted_in boolean, last_inbound_at timestamptz,
  reply_window_ends_at timestamptz, reply_window_open boolean, messages jsonb
)
language sql stable security definer set search_path = ''
as $$
  select booking.id, private.booking_whatsapp_enabled(booking),
    booking.whatsapp_last_inbound_at,
    booking.whatsapp_last_inbound_at + interval '24 hours',
    booking.whatsapp_last_inbound_at > now() - interval '24 hours',
    coalesce((select jsonb_agg(jsonb_build_object(
      'direction', message.direction, 'body', message.body,
      'occurredAt', message.occurred_at,
      'providerStatus', delivery.provider_status
    ) order by message.occurred_at)
    from public.booking_whatsapp_messages message
    left join public.booking_communication_deliveries delivery
      on delivery.id = message.delivery_id
    where message.booking_request_id = booking.id), '[]'::jsonb)
  from public.service_booking_requests booking
  join public.customer_profiles customer on customer.id = booking.customer_id
  where customer.auth_user_id = (select auth.uid())
$$;

create function public.get_managed_booking_whatsapp_state()
returns table (
  booking_id uuid, opted_in boolean, last_inbound_at timestamptz,
  reply_window_ends_at timestamptz, reply_window_open boolean, messages jsonb
)
language sql stable security definer set search_path = ''
as $$
  select booking.id, private.booking_whatsapp_enabled(booking),
    booking.whatsapp_last_inbound_at,
    booking.whatsapp_last_inbound_at + interval '24 hours',
    booking.whatsapp_last_inbound_at > now() - interval '24 hours',
    coalesce((select jsonb_agg(jsonb_build_object(
      'direction', message.direction, 'body', message.body,
      'occurredAt', message.occurred_at,
      'providerStatus', delivery.provider_status
    ) order by message.occurred_at)
    from public.booking_whatsapp_messages message
    left join public.booking_communication_deliveries delivery
      on delivery.id = message.delivery_id
    where message.booking_request_id = booking.id), '[]'::jsonb)
  from public.service_booking_requests booking
  where private.current_workshop_manager_id(booking.workshop_id) is not null
$$;

create function public.get_booking_whatsapp_state_with_access_token(
  requested_token_digest text
)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'optedIn', private.booking_whatsapp_enabled(booking),
    'lastInboundAt', booking.whatsapp_last_inbound_at,
    'replyWindowEndsAt', booking.whatsapp_last_inbound_at + interval '24 hours',
    'replyWindowOpen', booking.whatsapp_last_inbound_at > now() - interval '24 hours',
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
      'direction', message.direction, 'body', message.body,
      'occurredAt', message.occurred_at,
      'providerStatus', delivery.provider_status
    ) order by message.occurred_at)
    from public.booking_whatsapp_messages message
    left join public.booking_communication_deliveries delivery
      on delivery.id = message.delivery_id
    where message.booking_request_id = booking.id), '[]'::jsonb)
  ) from public.service_booking_requests booking
  where requested_token_digest ~ '^[0-9a-f]{64}$'
    and booking.management_token_digest = decode(requested_token_digest, 'hex')
    and booking.management_token_expires_at > now()
$$;

revoke all on function public.get_my_booking_whatsapp_state() from public, anon, authenticated;
revoke all on function public.get_managed_booking_whatsapp_state() from public, anon, authenticated;
revoke all on function public.get_booking_whatsapp_state_with_access_token(text)
  from public, anon, authenticated;
grant execute on function public.get_my_booking_whatsapp_state() to authenticated;
grant execute on function public.get_managed_booking_whatsapp_state() to authenticated;
grant execute on function public.get_booking_whatsapp_state_with_access_token(text) to service_role;

create function public.queue_managed_booking_whatsapp_reply(
  requested_booking_id uuid, requested_body text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare booking_row public.service_booking_requests%rowtype;
  normalized_body text := nullif(btrim(requested_body), '');
  event_id uuid; delivery_id uuid;
begin
  select booking.* into booking_row from public.service_booking_requests booking
  where booking.id = requested_booking_id for update;
  if booking_row.id is null
    or private.current_workshop_manager_id(booking_row.workshop_id) is null then
    raise exception 'Booking unavailable' using errcode = '42501'; end if;
  if normalized_body is null or char_length(normalized_body) > 4096 then
    raise exception 'Message must contain 1 to 4096 characters' using errcode = '23514'; end if;
  if not private.booking_whatsapp_enabled(booking_row)
    or booking_row.whatsapp_last_inbound_at is null
    or booking_row.whatsapp_last_inbound_at <= now() - interval '24 hours' then
    raise exception 'WhatsApp reply window is closed' using errcode = '23514'; end if;
  insert into public.booking_communication_events(
    booking_request_id, event_kind, audience, payload
  ) values (
    booking_row.id, 'workshop_whatsapp_reply', 'customer',
    jsonb_build_object('note', normalized_body)
  ) returning id into event_id;
  insert into public.booking_communication_deliveries(
    event_id, channel, destination, message_mode, message_body
  ) values (
    event_id, 'whatsapp', booking_row.customer_phone,
    'session_text', normalized_body
  ) returning id into delivery_id;
  insert into public.booking_communication_deliveries(
    event_id, channel, destination, status, sent_at
  ) values (event_id, 'in_app', 'customer', 'sent', now());
  insert into public.booking_whatsapp_messages(
    booking_request_id, delivery_id, direction, body, sender_auth_user_id
  ) values (
    booking_row.id, delivery_id, 'outbound', normalized_body, (select auth.uid())
  );
  return booking_row.id;
end;
$$;

revoke all on function public.queue_managed_booking_whatsapp_reply(uuid, text)
  from public, anon, authenticated;
grant execute on function public.queue_managed_booking_whatsapp_reply(uuid, text)
  to authenticated;

drop function public.claim_due_booking_communication_deliveries(integer, uuid);
create function public.claim_due_booking_communication_deliveries(
  requested_limit integer default 20, requested_booking_id uuid default null
)
returns table (
  delivery_id uuid, booking_id uuid, event_kind text,
  audience public.booking_communication_audience,
  channel public.booking_communication_channel, destination text,
  locale text, customer_name text, workshop_name text, service_name text,
  vehicle_registration text, confirmed_start timestamptz, proposed_start timestamptz,
  note text, timezone text, message_mode text, message_body text
)
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  with claimed as (
    select delivery.id
    from public.booking_communication_deliveries delivery
    join public.booking_communication_events event on event.id = delivery.event_id
    where delivery.channel in ('email', 'sms', 'whatsapp')
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
    event.payload ->> 'note', workshop.time_zone,
    updated.message_mode, updated.message_body
  from updated
  join public.booking_communication_events event on event.id = updated.event_id
  join public.service_booking_requests booking on booking.id = event.booking_request_id
  join public.workshops workshop on workshop.id = booking.workshop_id
  join public.workshop_services service on service.id = booking.service_id;
end;
$$;

revoke all on function public.claim_due_booking_communication_deliveries(integer, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_due_booking_communication_deliveries(integer, uuid)
  to service_role;

create or replace function public.complete_booking_communication_delivery(
  requested_delivery_id uuid, delivery_succeeded boolean,
  requested_provider_message_id text, requested_error_code text
)
returns void language plpgsql security definer set search_path = ''
as $$
declare completed public.booking_communication_deliveries%rowtype;
begin
  update public.booking_communication_deliveries set
    status = case when delivery_succeeded then 'sent'::public.booking_communication_delivery_status
      else 'failed'::public.booking_communication_delivery_status end,
    provider_message_id = case when delivery_succeeded then nullif(requested_provider_message_id, '') else null end,
    provider_status = case when delivery_succeeded and channel = 'whatsapp' then 'accepted' else provider_status end,
    last_error_code = case when delivery_succeeded then null else left(coalesce(requested_error_code, 'provider_error'), 120) end,
    sent_at = case when delivery_succeeded then now() else null end
  where id = requested_delivery_id and status = 'processing'
  returning * into completed;
  if completed.id is null then return; end if;
  update public.booking_whatsapp_messages set
    provider_message_id = completed.provider_message_id,
    occurred_at = coalesce(completed.sent_at, occurred_at)
  where delivery_id = completed.id;
  if not delivery_succeeded and completed.channel = 'whatsapp'
    and completed.message_mode = 'template' and completed.attempt_count >= 5 then
    insert into public.booking_communication_deliveries(event_id, channel, destination)
    values (completed.event_id, 'sms', completed.destination)
    on conflict (event_id, channel, destination) do nothing;
  end if;
end;
$$;

create or replace function public.claim_due_service_booking_notifications(
  requested_limit integer default 20, requested_booking_id uuid default null
)
returns table (
  notification_id uuid, booking_id uuid,
  notification_kind public.service_booking_notification_kind,
  destination_phone text, locale text, customer_name text,
  workshop_name text, service_name text, vehicle_registration text,
  confirmed_start timestamptz, timezone text
)
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  with claimed as (
    select notification.id
    from public.service_booking_notifications notification
    join public.service_booking_requests booking on booking.id = notification.booking_request_id
    where (notification.status in ('pending', 'failed')
        or (notification.status = 'processing'
          and notification.claimed_at < now() - interval '10 minutes'))
      and notification.attempt_count < 5 and notification.scheduled_for <= now()
      and not private.booking_whatsapp_enabled(booking)
      and (requested_booking_id is null or booking.id = requested_booking_id)
      and case notification.kind
        when 'reminder_24h' then booking.status = 'confirmed' and booking.confirmed_start > now()
        when 'booking_confirmed' then booking.status not in ('declined', 'cancelled', 'no_show')
        when 'repair_started' then booking.status in ('in_service', 'ready_for_collection', 'completed')
        when 'ready_for_pickup' then booking.status in ('ready_for_collection', 'completed')
        when 'review_request' then booking.status = 'completed'
      end
    order by notification.scheduled_for
    for update of notification skip locked
    limit greatest(1, least(requested_limit, 100))
  ), updated as (
    update public.service_booking_notifications notification set
      status = 'processing', attempt_count = notification.attempt_count + 1, claimed_at = now()
    from claimed where notification.id = claimed.id returning notification.*
  )
  select updated.id, booking.id, updated.kind, updated.destination_phone,
    booking.locale, booking.customer_name, workshop.display_name,
    service.name, booking.vehicle_registration, booking.confirmed_start,
    workshop.time_zone
  from updated
  join public.service_booking_requests booking on booking.id = updated.booking_request_id
  join public.workshop_services service
    on service.id = booking.service_id and service.workshop_id = booking.workshop_id
  join public.workshops workshop on workshop.id = booking.workshop_id;
end;
$$;

create function public.record_whatsapp_inbound_message(
  requested_provider_message_id text, requested_from text,
  requested_body text, requested_context_message_id text,
  requested_occurred_at timestamptz
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare normalized_phone text := '+' || regexp_replace(requested_from, '[^0-9]', '', 'g');
  normalized_body text := nullif(btrim(requested_body), '');
  booking_row public.service_booking_requests%rowtype;
  referenced_booking_id uuid; inserted_message_id uuid; event_id uuid; opted_out boolean;
begin
  if requested_provider_message_id is null or normalized_body is null
    or char_length(normalized_body) > 4096 or normalized_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Invalid WhatsApp message' using errcode = '23514'; end if;
  referenced_booking_id := substring(normalized_body from
    '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})')::uuid;
  select booking.* into booking_row
  from public.booking_communication_deliveries delivery
  join public.booking_communication_events event on event.id = delivery.event_id
  join public.service_booking_requests booking on booking.id = event.booking_request_id
  where delivery.provider_message_id = requested_context_message_id
    and booking.customer_phone = normalized_phone
  order by delivery.created_at desc limit 1;
  if booking_row.id is null and referenced_booking_id is not null then
    select booking.* into booking_row from public.service_booking_requests booking
    where booking.id = referenced_booking_id and booking.customer_phone = normalized_phone
    limit 1;
  end if;
  if booking_row.id is null then
    select booking.* into booking_row from public.service_booking_requests booking
    where booking.customer_phone = normalized_phone
      and booking.status not in ('completed', 'declined', 'cancelled', 'no_show')
    order by booking.created_at desc limit 1;
  end if;
  if booking_row.id is null then return null; end if;
  insert into public.booking_whatsapp_messages(
    booking_request_id, direction, body, provider_message_id, occurred_at
  ) values (
    booking_row.id, 'inbound', normalized_body, requested_provider_message_id,
    coalesce(requested_occurred_at, now())
  ) on conflict (provider_message_id) do nothing returning id into inserted_message_id;
  if inserted_message_id is null then return booking_row.id; end if;

  opted_out := lower(regexp_replace(normalized_body, '[^[:alpha:]]', '', 'g')) in (
    'stop', 'unsubscribe', 'cancel', 'abmelden', 'abbestellen', 'stopp',
    'dezabonare', 'oprire', 'leiratkozás', 'leiratkozas', 'leiratkozs'
  );
  if opted_out then
    update public.service_booking_requests set whatsapp_opt_out_at = now()
    where customer_phone = normalized_phone;
    update public.booking_communication_deliveries delivery set status = 'cancelled'
    from public.booking_communication_events event,
      public.service_booking_requests booking
    where delivery.event_id = event.id and event.booking_request_id = booking.id
      and booking.customer_phone = normalized_phone and delivery.channel = 'whatsapp'
      and delivery.status in ('pending', 'processing', 'failed');
    update public.service_booking_notifications notification set
      status = 'pending', attempt_count = 0, claimed_at = null,
      provider_message_id = null, last_error_code = null, sent_at = null
    from public.service_booking_requests booking
    where notification.booking_request_id = booking.id
      and booking.customer_phone = normalized_phone
      and booking.status = 'confirmed'
      and notification.kind = 'reminder_24h'
      and notification.scheduled_for > now() and notification.status = 'cancelled';
  else
    perform private.apply_booking_whatsapp_preference(
      booking_row.id, true, 'customer_message'
    );
    update public.service_booking_requests set
      whatsapp_last_inbound_at = coalesce(requested_occurred_at, now()),
      whatsapp_customer_wa_id = regexp_replace(requested_from, '[^0-9]', '', 'g')
    where id = booking_row.id;
  end if;
  insert into public.booking_communication_events(
    booking_request_id, event_kind, audience, payload,
    created_at
  ) values (
    booking_row.id, case when opted_out then 'whatsapp_opt_out'
      else 'whatsapp_customer_message' end,
    'workshop', jsonb_build_object('note', normalized_body),
    coalesce(requested_occurred_at, now())
  ) returning id into event_id;
  insert into public.booking_communication_deliveries(
    event_id, channel, destination, status, sent_at
  ) values (event_id, 'in_app', 'workshop', 'sent', now());
  return booking_row.id;
end;
$$;

create function public.record_whatsapp_delivery_status(
  requested_provider_message_id text, requested_status text,
  requested_occurred_at timestamptz, requested_error_code text
)
returns void language plpgsql security definer set search_path = ''
as $$
declare delivery_row public.booking_communication_deliveries%rowtype;
begin
  if requested_status not in ('sent', 'delivered', 'read', 'failed', 'deleted') then return; end if;
  update public.booking_communication_deliveries set
    provider_status = requested_status,
    status = case when requested_status = 'failed'
      then 'failed'::public.booking_communication_delivery_status
      else 'sent'::public.booking_communication_delivery_status end,
    attempt_count = case when requested_status = 'failed' then 5 else attempt_count end,
    delivered_at = case when requested_status in ('delivered', 'read')
      then coalesce(delivered_at, requested_occurred_at, now()) else delivered_at end,
    read_at = case when requested_status = 'read'
      then coalesce(read_at, requested_occurred_at, now()) else read_at end,
    last_error_code = case when requested_status = 'failed'
      then left(coalesce(requested_error_code, 'whatsapp_failed'), 120) else last_error_code end
  where provider_message_id = requested_provider_message_id and channel = 'whatsapp'
    and case requested_status
      when 'sent' then 2 when 'delivered' then 3 when 'read' then 4
      when 'failed' then 5 when 'deleted' then 5 else 0 end
      >= case provider_status
        when 'accepted' then 1 when 'sent' then 2 when 'delivered' then 3
        when 'read' then 4 when 'failed' then 5 when 'deleted' then 5 else 0 end
  returning * into delivery_row;
  if requested_status = 'failed' and delivery_row.message_mode = 'template' then
    insert into public.booking_communication_deliveries(event_id, channel, destination)
    values (delivery_row.event_id, 'sms', delivery_row.destination)
    on conflict (event_id, channel, destination) do nothing;
  end if;
end;
$$;

revoke all on function public.record_whatsapp_inbound_message(text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.record_whatsapp_delivery_status(text, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.record_whatsapp_inbound_message(text, text, text, text, timestamptz)
  to service_role;
grant execute on function public.record_whatsapp_delivery_status(text, text, timestamptz, text)
  to service_role;

create function public.get_admin_whatsapp_summary()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case when private.is_active_platform_admin() then jsonb_build_object(
    'optedInBookings', (select count(*) from public.service_booking_requests booking
      where private.booking_whatsapp_enabled(booking)),
    'inboundMessages', (select count(*) from public.booking_whatsapp_messages
      where direction = 'inbound'),
    'accepted', count(*) filter (where provider_status in ('accepted', 'sent')),
    'delivered', count(*) filter (where provider_status = 'delivered'),
    'read', count(*) filter (where provider_status = 'read'),
    'failed', count(*) filter (where provider_status = 'failed')
  ) else null end
  from public.booking_communication_deliveries where channel = 'whatsapp'
$$;

revoke all on function public.get_admin_whatsapp_summary() from public, anon, authenticated;
grant execute on function public.get_admin_whatsapp_summary() to authenticated;

comment on table public.booking_whatsapp_messages is
  'Booking-scoped WhatsApp conversation content. Direct table access is denied; role-scoped RPCs expose only related threads.';
comment on column public.service_booking_requests.whatsapp_opt_in_at is
  'Operational WhatsApp opt-in for this booking; marketing consent is deliberately not collected here.';
comment on function public.queue_managed_booking_whatsapp_reply(uuid, text) is
  'Queues a workshop reply only during the 24-hour customer-service window opened by an inbound WhatsApp message.';

commit;
