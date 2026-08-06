begin;

alter table public.service_booking_request_history
  add column actor_customer_id uuid
    references public.customer_profiles(id) on delete restrict,
  add constraint service_booking_history_single_actor
    check (
      actor_workshop_manager_id is null
      or actor_customer_id is null
    );

create function public.get_my_service_booking_requests()
returns table (
  booking_id uuid,
  workshop_id uuid,
  workshop_name text,
  workshop_phone text,
  workshop_email text,
  workshop_city text,
  workshop_address text,
  service_name text,
  service_category text,
  booking_status public.service_booking_status,
  vehicle_registration text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year integer,
  preferred_start timestamptz,
  alternate_start timestamptz,
  confirmed_start timestamptz,
  proposed_start timestamptz,
  proposal_note text,
  customer_note text,
  workshop_note text,
  created_at timestamptz,
  can_cancel boolean,
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
    workshop.public_phone,
    workshop.public_email,
    workshop.city,
    workshop.address,
    service.name,
    service.category,
    booking.status,
    booking.vehicle_registration,
    booking.vehicle_make,
    booking.vehicle_model,
    booking.vehicle_year,
    booking.preferred_start,
    booking.alternate_start,
    booking.confirmed_start,
    booking.workshop_proposed_start,
    booking.workshop_proposal_note,
    booking.customer_note,
    booking.workshop_note,
    booking.created_at,
    booking.status in ('requested', 'confirmed')
      and greatest(
        booking.preferred_start,
        booking.alternate_start,
        booking.confirmed_start,
        booking.workshop_proposed_start
      ) > now(),
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
  join public.customer_profiles customer
    on customer.id = booking.customer_id
  join public.workshop_services service
    on service.id = booking.service_id
  join public.workshops workshop
    on workshop.legacy_workshop_profile_id = booking.workshop_id
  where customer.auth_user_id = (select auth.uid())
  order by
    case booking.status
      when 'requested' then 0
      when 'confirmed' then 1
      else 2
    end,
    coalesce(booking.confirmed_start, booking.preferred_start) desc,
    booking.created_at desc
  limit 250
$$;

revoke all on function public.get_my_service_booking_requests()
  from public, anon, authenticated;
grant execute on function public.get_my_service_booking_requests()
  to authenticated;

create function public.manage_my_service_booking_request(
  requested_booking_id uuid,
  requested_action text,
  requested_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  authorized record;
  customer_id uuid;
  booking_row public.service_booking_requests%rowtype;
  previous_status public.service_booking_status;
  previous_confirmed_start timestamptz;
  accepted_start timestamptz;
  normalized_note text := nullif(btrim(requested_note), '');
  history_action public.service_booking_management_action;
begin
  -- Ownership validation and row locking share one statement and snapshot.
  select booking as booking_record, customer.id as customer_id
  into authorized
  from public.service_booking_requests booking
  join public.customer_profiles customer
    on customer.id = booking.customer_id
  where booking.id = requested_booking_id
    and customer.auth_user_id = (select auth.uid())
  limit 1
  for update of booking;

  booking_row := authorized.booking_record;
  customer_id := authorized.customer_id;

  if booking_row.id is null or customer_id is null then
    raise exception 'Service booking request is unavailable'
      using errcode = '42501';
  end if;

  previous_status := booking_row.status;
  previous_confirmed_start := booking_row.confirmed_start;

  if requested_action = 'accept_proposal' then
    accepted_start := booking_row.workshop_proposed_start;
    if booking_row.status not in ('requested', 'confirmed')
      or accepted_start is null or accepted_start <= now() then
      raise exception 'A current future workshop proposal is required'
        using errcode = '23514';
    end if;
    update public.service_booking_requests set
      status = 'confirmed',
      confirmed_start = accepted_start,
      workshop_proposed_start = null,
      workshop_proposal_note = null,
      proposal_updated_at = null,
      status_changed_at = now()
    where id = requested_booking_id;
    history_action := 'proposal_accepted';

  elsif requested_action = 'decline_proposal' then
    if booking_row.status not in ('requested', 'confirmed')
      or booking_row.workshop_proposed_start is null then
      raise exception 'A current workshop proposal is required'
        using errcode = '23514';
    end if;
    accepted_start := booking_row.workshop_proposed_start;
    update public.service_booking_requests set
      workshop_proposed_start = null,
      workshop_proposal_note = null,
      proposal_updated_at = null,
      status_changed_at = now()
    where id = requested_booking_id;
    history_action := 'proposal_declined';

  elsif requested_action = 'cancel' then
    if booking_row.status not in ('requested', 'confirmed')
      or greatest(
        booking_row.preferred_start,
        booking_row.alternate_start,
        booking_row.confirmed_start,
        booking_row.workshop_proposed_start
      ) <= now()
      or normalized_note is null then
      raise exception 'An open future booking and cancellation reason are required'
        using errcode = '23514';
    end if;
    update public.service_booking_requests set
      status = 'cancelled',
      workshop_proposed_start = null,
      workshop_proposal_note = null,
      proposal_updated_at = null,
      status_changed_at = now()
    where id = requested_booking_id;
    history_action := 'customer_cancelled';

  else
    raise exception 'Unsupported customer booking action'
      using errcode = '22023';
  end if;

  select booking.* into booking_row
  from public.service_booking_requests booking
  where booking.id = requested_booking_id;

  insert into public.service_booking_request_history (
    booking_request_id, action, previous_status, new_status,
    previous_confirmed_start, new_confirmed_start, proposed_start,
    note, actor_customer_id
  ) values (
    requested_booking_id, history_action, previous_status, booking_row.status,
    previous_confirmed_start, booking_row.confirmed_start, accepted_start,
    normalized_note, customer_id
  );
end;
$$;

revoke all on function public.manage_my_service_booking_request(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.manage_my_service_booking_request(uuid, text, text)
  to authenticated;

comment on function public.get_my_service_booking_requests() is
  'Customer-safe booking view. Actor identities and manager-only contact data are not returned.';
comment on column public.service_booking_request_history.actor_customer_id is
  'Customer responsible for a customer-authored lifecycle action; mutually exclusive with a manager actor.';

commit;
