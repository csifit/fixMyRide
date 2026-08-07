begin;

create type public.service_booking_notification_kind as enum (
  'booking_confirmed',
  'reminder_24h',
  'repair_started',
  'ready_for_pickup',
  'review_request'
);

create type public.service_booking_notification_status as enum (
  'pending', 'processing', 'sent', 'failed', 'cancelled'
);

create table public.service_booking_notifications (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null
    references public.service_booking_requests(id) on delete restrict,
  kind public.service_booking_notification_kind not null,
  status public.service_booking_notification_status not null default 'pending',
  scheduled_for timestamptz not null,
  destination_phone text not null check (char_length(destination_phone) between 7 and 40),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  provider_message_id text,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 80),
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_request_id, kind)
);

create index service_booking_notifications_due_idx
  on public.service_booking_notifications(status, scheduled_for)
  where status in ('pending', 'failed', 'processing');

create trigger service_booking_notifications_updated_at
before update on public.service_booking_notifications
for each row execute function public.set_updated_at();

alter table public.service_booking_notifications enable row level security;
revoke all on table public.service_booking_notifications
  from public, anon, authenticated;

create function private.queue_service_booking_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  phone text := nullif(btrim(new.customer_phone), '');
  status_changed boolean;
  start_changed boolean;
begin
  status_changed := tg_op = 'INSERT';
  start_changed := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    status_changed := old.status is distinct from new.status;
    start_changed := old.confirmed_start is distinct from new.confirmed_start;
  end if;

  if phone is null then
    if tg_op = 'UPDATE' and old.customer_phone is distinct from new.customer_phone then
      update public.service_booking_notifications set status = 'cancelled'
      where booking_request_id = new.id and status <> 'sent';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.customer_phone is distinct from new.customer_phone then
    update public.service_booking_notifications set destination_phone = phone
    where booking_request_id = new.id and status <> 'sent';
  end if;

  if new.status = 'confirmed' and status_changed then
    insert into public.service_booking_notifications (
      booking_request_id, kind, scheduled_for, destination_phone
    ) values (new.id, 'booking_confirmed', now(), phone)
    on conflict (booking_request_id, kind) do nothing;
  end if;

  if new.status = 'confirmed' and start_changed then
    if new.confirmed_start > now() + interval '24 hours' then
      insert into public.service_booking_notifications (
        booking_request_id, kind, scheduled_for, destination_phone
      ) values (
        new.id, 'reminder_24h', new.confirmed_start - interval '24 hours', phone
      )
      on conflict (booking_request_id, kind) do update set
        scheduled_for = excluded.scheduled_for,
        destination_phone = excluded.destination_phone,
        status = 'pending', attempt_count = 0, provider_message_id = null,
        last_error_code = null, claimed_at = null, sent_at = null
      where service_booking_notifications.status <> 'sent';
    else
      update public.service_booking_notifications set status = 'cancelled'
      where booking_request_id = new.id and kind = 'reminder_24h'
        and status <> 'sent';
    end if;
  end if;

  if status_changed and new.status = 'in_service' then
    insert into public.service_booking_notifications (
      booking_request_id, kind, scheduled_for, destination_phone
    ) values (new.id, 'repair_started', now(), phone)
    on conflict (booking_request_id, kind) do nothing;
  elsif status_changed and new.status = 'ready_for_collection' then
    insert into public.service_booking_notifications (
      booking_request_id, kind, scheduled_for, destination_phone
    ) values (new.id, 'ready_for_pickup', now(), phone)
    on conflict (booking_request_id, kind) do nothing;
  elsif status_changed and new.status = 'completed' then
    insert into public.service_booking_notifications (
      booking_request_id, kind, scheduled_for, destination_phone
    ) values (new.id, 'review_request', now(), phone)
    on conflict (booking_request_id, kind) do nothing;
  end if;

  if status_changed and new.status in ('declined', 'cancelled', 'no_show') then
    update public.service_booking_notifications set status = 'cancelled'
    where booking_request_id = new.id and kind = 'reminder_24h'
      and status <> 'sent';
  end if;

  return new;
end;
$$;

revoke all on function private.queue_service_booking_notifications()
  from public, anon, authenticated;

create trigger service_booking_requests_queue_notifications
after insert or update of status, confirmed_start, customer_phone
on public.service_booking_requests
for each row execute function private.queue_service_booking_notifications();

-- Existing confirmed bookings receive only a future reminder. Applying this
-- migration must not send a late confirmation for an already-confirmed booking.
insert into public.service_booking_notifications (
  booking_request_id, kind, scheduled_for, destination_phone
)
select booking.id, 'reminder_24h',
  booking.confirmed_start - interval '24 hours', booking.customer_phone
from public.service_booking_requests booking
where booking.status = 'confirmed'
  and booking.customer_phone is not null
  and booking.confirmed_start > now() + interval '24 hours'
on conflict (booking_request_id, kind) do nothing;

create function public.claim_due_service_booking_notifications(
  requested_limit integer default 20,
  requested_booking_id uuid default null
)
returns table (
  notification_id uuid,
  booking_id uuid,
  notification_kind public.service_booking_notification_kind,
  destination_phone text,
  locale text,
  customer_name text,
  workshop_name text,
  service_name text,
  vehicle_registration text,
  confirmed_start timestamptz,
  timezone text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select notification.id
    from public.service_booking_notifications notification
    join public.service_booking_requests booking
      on booking.id = notification.booking_request_id
    where (
        notification.status in ('pending', 'failed')
        or (notification.status = 'processing'
          and notification.claimed_at < now() - interval '10 minutes')
      )
      and notification.attempt_count < 5
      and notification.scheduled_for <= now()
      and (requested_booking_id is null or booking.id = requested_booking_id)
      and case notification.kind
        when 'reminder_24h' then booking.status = 'confirmed'
          and booking.confirmed_start > now()
        when 'booking_confirmed' then booking.status not in ('declined', 'cancelled', 'no_show')
        when 'repair_started' then booking.status in ('in_service', 'ready_for_collection', 'completed')
        when 'ready_for_pickup' then booking.status in ('ready_for_collection', 'completed')
        when 'review_request' then booking.status = 'completed'
      end
    order by notification.scheduled_for
    for update of notification skip locked
    limit greatest(1, least(requested_limit, 100))
  ),
  updated as (
    update public.service_booking_notifications notification set
      status = 'processing', attempt_count = notification.attempt_count + 1,
      claimed_at = now()
    from claimed where notification.id = claimed.id
    returning notification.*
  )
  select updated.id, booking.id, updated.kind, updated.destination_phone,
    booking.locale, booking.customer_name, clinic.display_name,
    service.name, booking.vehicle_registration, booking.confirmed_start,
    workshop.time_zone
  from updated
  join public.service_booking_requests booking
    on booking.id = updated.booking_request_id
  join public.workshop_services service on service.id = booking.service_id
  join public.workshop_profiles profile on profile.id = booking.workshop_id
  join public.clinics clinic on clinic.id = profile.clinic_id
  join public.workshops workshop
    on workshop.legacy_workshop_profile_id = profile.id;
end;
$$;

create function public.complete_service_booking_notification(
  requested_notification_id uuid,
  delivery_succeeded boolean,
  requested_provider_message_id text,
  requested_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.service_booking_notifications set
    status = case when delivery_succeeded
      then 'sent'::public.service_booking_notification_status
      else 'failed'::public.service_booking_notification_status end,
    provider_message_id = case when delivery_succeeded
      then nullif(requested_provider_message_id, '') else null end,
    last_error_code = case when delivery_succeeded then null
      else left(coalesce(requested_error_code, 'provider_error'), 80) end,
    sent_at = case when delivery_succeeded then now() else null end
  where id = requested_notification_id and status = 'processing';
end;
$$;

revoke all on function public.claim_due_service_booking_notifications(integer, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_service_booking_notification(uuid, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_due_service_booking_notifications(integer, uuid)
  to service_role;
grant execute on function public.complete_service_booking_notification(uuid, boolean, text, text)
  to service_role;

comment on table public.service_booking_notifications is
  'Exactly five deduplicated SMS lifecycle event kinds per service booking; provider retries never create additional event rows.';

commit;
