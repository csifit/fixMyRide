begin;

create type public.service_booking_management_action as enum (
  'request_received',
  'migration_snapshot',
  'confirmed',
  'time_proposed',
  'rescheduled',
  'declined',
  'cancelled'
);

alter table public.service_booking_requests
  add column workshop_proposed_start timestamptz,
  add column workshop_proposal_note text,
  add column proposal_updated_at timestamptz,
  add constraint service_booking_proposal_note_length
    check (workshop_proposal_note is null or char_length(workshop_proposal_note) <= 1000),
  add constraint service_booking_proposal_pair
    check ((workshop_proposed_start is null) = (proposal_updated_at is null));

create table public.service_booking_request_history (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null
    references public.service_booking_requests(id) on delete restrict,
  action public.service_booking_management_action not null,
  previous_status public.service_booking_status,
  new_status public.service_booking_status not null,
  previous_confirmed_start timestamptz,
  new_confirmed_start timestamptz,
  proposed_start timestamptz,
  note text check (note is null or char_length(note) <= 2000),
  actor_workshop_manager_id uuid
    references public.workshop_manager_profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index service_booking_request_history_request_idx
  on public.service_booking_request_history(booking_request_id, created_at desc);

alter table public.service_booking_request_history enable row level security;
revoke all on table public.service_booking_request_history
  from public, anon, authenticated;

create function private.prevent_service_booking_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Service booking history is immutable'
    using errcode = '42501';
end;
$$;

revoke all on function private.prevent_service_booking_history_mutation()
  from public, anon, authenticated;

create trigger service_booking_request_history_immutable
before update or delete on public.service_booking_request_history
for each row execute function private.prevent_service_booking_history_mutation();

create function private.record_new_service_booking_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.service_booking_request_history (
    booking_request_id, action, previous_status, new_status,
    new_confirmed_start, proposed_start, note
  ) values (
    new.id, 'request_received', null, new.status,
    new.confirmed_start, new.workshop_proposed_start, null
  );
  return new;
end;
$$;

revoke all on function private.record_new_service_booking_request()
  from public, anon, authenticated;

create trigger service_booking_requests_record_created
after insert on public.service_booking_requests
for each row execute function private.record_new_service_booking_request();

insert into public.service_booking_request_history (
  booking_request_id, action, previous_status, new_status,
  new_confirmed_start, proposed_start, note, created_at
)
select request.id, 'migration_snapshot', null, request.status,
  request.confirmed_start, request.workshop_proposed_start,
  null,
  request.created_at
from public.service_booking_requests request;

create function public.get_managed_service_booking_requests(
  requested_status text default null
)
returns table (
  booking_id uuid,
  workshop_id uuid,
  workshop_name text,
  service_name text,
  service_category text,
  booking_status public.service_booking_status,
  customer_name text,
  customer_phone text,
  customer_email text,
  vehicle_registration text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year integer,
  mileage_km integer,
  preferred_start timestamptz,
  alternate_start timestamptz,
  confirmed_start timestamptz,
  proposed_start timestamptz,
  proposal_note text,
  customer_note text,
  workshop_note text,
  mobility_requirement text,
  locale text,
  created_at timestamptz,
  history jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    booking.id,
    workshop.id,
    workshop.display_name,
    service.name,
    service.category,
    booking.status,
    booking.customer_name,
    booking.customer_phone,
    booking.customer_email,
    booking.vehicle_registration,
    booking.vehicle_make,
    booking.vehicle_model,
    booking.vehicle_year,
    booking.mileage_km,
    booking.preferred_start,
    booking.alternate_start,
    booking.confirmed_start,
    booking.workshop_proposed_start,
    booking.workshop_proposal_note,
    booking.customer_note,
    booking.workshop_note,
    booking.mobility_requirement,
    booking.locale,
    booking.created_at,
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
  join public.workshop_manager_memberships membership
    on membership.service_provider_id = workshop.service_provider_id
    and membership.status = 'active'
    and membership.membership_role in ('owner', 'manager')
  join public.workshop_manager_profiles manager
    on manager.id = membership.workshop_manager_id
    and manager.status = 'active'
  join public.service_providers provider
    on provider.id = workshop.service_provider_id
    and provider.status = 'active'
  where manager.auth_user_id = (select auth.uid())
    and (
      nullif(btrim(requested_status), '') is null
      or booking.status::text = btrim(requested_status)
    )
  order by
    case booking.status
      when 'requested' then 0
      when 'confirmed' then 1
      else 2
    end,
    booking.created_at desc
  limit 250
$$;

revoke all on function public.get_managed_service_booking_requests(text)
  from public, anon, authenticated;
grant execute on function public.get_managed_service_booking_requests(text)
  to authenticated;

create function public.manage_service_booking_request(
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
  -- Authorization and row locking share one statement and one MVCC snapshot.
  select booking, manager.id into booking_row, manager_id
  from public.service_booking_requests booking
  join public.workshops workshop
    on workshop.legacy_workshop_profile_id = booking.workshop_id
  join public.workshop_manager_memberships membership
    on membership.service_provider_id = workshop.service_provider_id
    and membership.status = 'active'
    and membership.membership_role in ('owner', 'manager')
  join public.workshop_manager_profiles manager
    on manager.id = membership.workshop_manager_id
    and manager.status = 'active'
  join public.service_providers provider
    on provider.id = workshop.service_provider_id
    and provider.status = 'active'
  where booking.id = requested_booking_id
    and manager.auth_user_id = (select auth.uid())
  limit 1
  for update of booking;

  if booking_row.id is null or manager_id is null then
    raise exception 'Workshop booking request is unavailable'
      using errcode = '42501';
  end if;

  previous_status := booking_row.status;
  previous_confirmed_start := booking_row.confirmed_start;

  if requested_action = 'confirm' then
    if booking_row.status <> 'requested'
      or requested_start is null or requested_start <= now() then
      raise exception 'Only a pending request can be confirmed at a future time'
        using errcode = '23514';
    end if;
    update public.service_booking_requests set
      status = 'confirmed',
      confirmed_start = requested_start,
      workshop_proposed_start = null,
      workshop_proposal_note = null,
      proposal_updated_at = null,
      workshop_note = coalesce(normalized_note, workshop_note),
      status_changed_at = now()
    where id = requested_booking_id;
    history_action := 'confirmed';

  elsif requested_action = 'propose_time' then
    if booking_row.status not in ('requested', 'confirmed')
      or requested_start is null or requested_start <= now() then
      raise exception 'A future time can only be proposed for an open request'
        using errcode = '23514';
    end if;
    update public.service_booking_requests set
      workshop_proposed_start = requested_start,
      workshop_proposal_note = normalized_note,
      proposal_updated_at = now(),
      status_changed_at = now()
    where id = requested_booking_id;
    history_action := 'time_proposed';

  elsif requested_action = 'reschedule' then
    if booking_row.status <> 'confirmed'
      or requested_start is null or requested_start <= now() then
      raise exception 'Only a confirmed booking can be rescheduled'
        using errcode = '23514';
    end if;
    update public.service_booking_requests set
      confirmed_start = requested_start,
      workshop_proposed_start = null,
      workshop_proposal_note = null,
      proposal_updated_at = null,
      workshop_note = coalesce(normalized_note, workshop_note),
      status_changed_at = now()
    where id = requested_booking_id;
    history_action := 'rescheduled';

  elsif requested_action = 'decline' then
    if booking_row.status <> 'requested' or normalized_note is null then
      raise exception 'A pending request and decline reason are required'
        using errcode = '23514';
    end if;
    update public.service_booking_requests set
      status = 'declined',
      confirmed_start = null,
      workshop_proposed_start = null,
      workshop_proposal_note = null,
      proposal_updated_at = null,
      workshop_note = normalized_note,
      status_changed_at = now()
    where id = requested_booking_id;
    history_action := 'declined';

  elsif requested_action = 'cancel' then
    if booking_row.status <> 'confirmed' or normalized_note is null then
      raise exception 'A confirmed booking and cancellation reason are required'
        using errcode = '23514';
    end if;
    update public.service_booking_requests set
      status = 'cancelled',
      workshop_proposed_start = null,
      workshop_proposal_note = null,
      proposal_updated_at = null,
      workshop_note = normalized_note,
      status_changed_at = now()
    where id = requested_booking_id;
    history_action := 'cancelled';

  else
    raise exception 'Unsupported workshop booking action'
      using errcode = '22023';
  end if;

  select booking.* into booking_row
  from public.service_booking_requests booking
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

revoke all on function public.manage_service_booking_request(
  uuid, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.manage_service_booking_request(
  uuid, text, timestamptz, text
) to authenticated;

comment on table public.service_booking_request_history is
  'Immutable workshop booking-request lifecycle history written only by trusted database functions.';
comment on column public.service_booking_requests.workshop_proposed_start is
  'A workshop proposal is not a confirmed booking until an explicit confirmation action succeeds.';

commit;
