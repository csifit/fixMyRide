begin;

create table public.service_booking_feedback (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null unique references public.service_booking_requests(id) on delete restrict,
  workshop_id uuid not null references public.workshops(id) on delete restrict,
  customer_id uuid not null references public.customer_profiles(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(btrim(comment)) between 2 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index service_booking_feedback_workshop_time_idx
  on public.service_booking_feedback(workshop_id, created_at desc);
create trigger service_booking_feedback_updated_at
before update on public.service_booking_feedback
for each row execute function public.set_updated_at();

alter table public.service_booking_feedback enable row level security;
revoke all on table public.service_booking_feedback from public, anon, authenticated;

create function public.submit_my_service_booking_feedback(
  requested_booking_id uuid,
  requested_rating integer,
  requested_comment text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_id uuid;
  booking_row public.service_booking_requests%rowtype;
  feedback_id uuid;
begin
  select customer.id into customer_id
  from public.customer_profiles customer
  join public.account_identities identity
    on identity.auth_user_id = customer.auth_user_id
    and identity.status = 'active'
  where customer.auth_user_id = (select auth.uid());
  select * into booking_row from public.service_booking_requests booking
  where booking.id = requested_booking_id for update;
  if customer_id is null or booking_row.id is null
    or booking_row.customer_id is distinct from customer_id
    or booking_row.status <> 'completed'
    or requested_rating not between 1 and 5 then
    raise exception 'Completed customer booking required' using errcode = '42501';
  end if;
  insert into public.service_booking_feedback (
    booking_request_id, workshop_id, customer_id, rating, comment
  ) values (
    booking_row.id, booking_row.workshop_id, customer_id, requested_rating,
    nullif(btrim(requested_comment), '')
  )
  on conflict (booking_request_id) do update set
    rating = excluded.rating, comment = excluded.comment
  returning id into feedback_id;
  return feedback_id;
end;
$$;

revoke all on function public.submit_my_service_booking_feedback(uuid, integer, text)
  from public, anon;
grant execute on function public.submit_my_service_booking_feedback(uuid, integer, text)
  to authenticated;

create function public.get_my_service_booking_feedback()
returns table (
  booking_id uuid,
  rating integer,
  comment text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select feedback.booking_request_id, feedback.rating::integer,
    feedback.comment, feedback.updated_at
  from public.service_booking_feedback feedback
  join public.customer_profiles customer on customer.id = feedback.customer_id
  join public.account_identities identity
    on identity.auth_user_id = customer.auth_user_id
    and identity.status = 'active'
  where customer.auth_user_id = (select auth.uid())
  order by feedback.updated_at desc
$$;

revoke all on function public.get_my_service_booking_feedback() from public, anon;
grant execute on function public.get_my_service_booking_feedback() to authenticated;

create function public.get_service_organisation_operational_dashboard(
  requested_service_provider_id uuid,
  requested_months integer default 6
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  provider_row public.service_providers%rowtype;
  month_count integer := least(greatest(coalesce(requested_months, 6), 1), 12);
  current_month timestamptz := date_trunc('month', now());
  dashboard jsonb;
begin
  select * into provider_row from public.service_providers provider
  where provider.id = requested_service_provider_id
    and provider.status = 'active';
  if provider_row.id is null
    or not private.can_manage_service_organisation(provider_row.id) then
    raise exception 'Service organisation owner access required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'providerId', provider_row.id,
    'providerName', provider_row.display_name,
    'generatedAt', now(),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', workshop.id,
        'name', workshop.display_name,
        'city', workshop.city,
        'status', workshop.status,
        'appointments', (
          select count(*) from public.service_booking_requests booking
          where booking.workshop_id = workshop.id
            and coalesce(booking.confirmed_start, booking.preferred_start) >= current_month
            and coalesce(booking.confirmed_start, booking.preferred_start) < current_month + interval '1 month'
            and booking.status not in ('declined', 'cancelled')
        ),
        'activeJobs', (
          select count(*) from public.service_booking_requests booking
          where booking.workshop_id = workshop.id
            and booking.status in ('confirmed', 'checked_in', 'diagnosing', 'awaiting_approval', 'in_service', 'ready_for_collection')
        ),
        'workloadMinutes', coalesce((
          select sum(booking.duration_minutes) from public.service_booking_requests booking
          where booking.workshop_id = workshop.id
            and coalesce(booking.confirmed_start, booking.preferred_start) >= current_month
            and coalesce(booking.confirmed_start, booking.preferred_start) < current_month + interval '1 month'
            and booking.status not in ('declined', 'cancelled', 'no_show')
        ), 0),
        'revenueByCurrency', coalesce((
          select jsonb_object_agg(revenue.currency, revenue.total_cents)
          from (
            select record.invoice_currency as currency,
              sum(record.invoice_total_cents) as total_cents
            from public.vehicle_service_records record
            join public.service_booking_requests booking on booking.id = record.booking_request_id
            where booking.workshop_id = workshop.id
              and record.invoice_total_cents is not null
              and coalesce(record.invoice_issued_on, booking.status_changed_at::date) >= current_month::date
              and coalesce(record.invoice_issued_on, booking.status_changed_at::date) < (current_month + interval '1 month')::date
            group by record.invoice_currency
          ) revenue
        ), '{}'::jsonb),
        'openEstimates', (
          select count(*) from public.repair_estimates estimate
          join public.service_booking_requests booking on booking.id = estimate.booking_request_id
          where booking.workshop_id = workshop.id and estimate.status = 'awaiting_customer'
        ),
        'overdueJobs', (
          select count(*) from public.service_booking_requests booking
          where booking.workshop_id = workshop.id
            and booking.status in ('confirmed', 'checked_in', 'diagnosing', 'awaiting_approval', 'in_service', 'ready_for_collection')
            and coalesce(booking.confirmed_start, booking.preferred_start)
              + make_interval(mins => booking.duration_minutes) < now()
        ),
        'inventoryAlerts', (
          select count(*) from public.workshop_inventory_items item
          where item.workshop_id = workshop.id
            and (item.quantity = 0 or (item.minimum_quantity > 0 and item.quantity <= item.minimum_quantity))
        ),
        'averageRating', (
          select round(avg(feedback.rating)::numeric, 2)
          from public.service_booking_feedback feedback
          where feedback.workshop_id = workshop.id
        ),
        'feedbackCount', (
          select count(*) from public.service_booking_feedback feedback
          where feedback.workshop_id = workshop.id
        ),
        'cancellationRate', coalesce((
          select round(100.0 * count(*) filter (where booking.status = 'cancelled') / nullif(count(*), 0), 1)
          from public.service_booking_requests booking
          where booking.workshop_id = workshop.id
            and booking.preferred_start >= current_month
            and booking.preferred_start < current_month + interval '1 month'
        ), 0)
      ) order by workshop.display_name)
      from public.workshops workshop
      where workshop.service_provider_id = provider_row.id
        and workshop.status in ('pending', 'active')
    ), '[]'::jsonb),
    'openEstimates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', estimate.id, 'workshopId', workshop.id,
        'workshopName', workshop.display_name, 'bookingId', booking.id,
        'customerName', booking.customer_name, 'serviceName', service.name,
        'totalCents', estimate.total_cents, 'currency', estimate.currency,
        'sentAt', estimate.sent_at
      ) order by estimate.sent_at)
      from public.repair_estimates estimate
      join public.service_booking_requests booking on booking.id = estimate.booking_request_id
      join public.workshops workshop on workshop.id = booking.workshop_id
      join public.workshop_services service on service.id = booking.service_id
      where workshop.service_provider_id = provider_row.id
        and estimate.status = 'awaiting_customer'
    ), '[]'::jsonb),
    'overdueJobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', booking.id, 'workshopId', workshop.id,
        'workshopName', workshop.display_name, 'customerName', booking.customer_name,
        'serviceName', service.name, 'status', booking.status,
        'scheduledAt', coalesce(booking.confirmed_start, booking.preferred_start)
      ) order by coalesce(booking.confirmed_start, booking.preferred_start))
      from public.service_booking_requests booking
      join public.workshops workshop on workshop.id = booking.workshop_id
      join public.workshop_services service on service.id = booking.service_id
      where workshop.service_provider_id = provider_row.id
        and booking.status in ('confirmed', 'checked_in', 'diagnosing', 'awaiting_approval', 'in_service', 'ready_for_collection')
        and coalesce(booking.confirmed_start, booking.preferred_start)
          + make_interval(mins => booking.duration_minutes) < now()
    ), '[]'::jsonb),
    'months', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', to_char(months.month_start, 'YYYY-MM-DD'),
        'appointments', (
          select count(*) from public.service_booking_requests booking
          join public.workshops workshop on workshop.id = booking.workshop_id
          where workshop.service_provider_id = provider_row.id
            and coalesce(booking.confirmed_start, booking.preferred_start) >= months.month_start
            and coalesce(booking.confirmed_start, booking.preferred_start) < months.month_start + interval '1 month'
            and booking.status not in ('declined', 'cancelled')
        ),
        'completedJobs', (
          select count(*) from public.service_booking_requests booking
          join public.workshops workshop on workshop.id = booking.workshop_id
          where workshop.service_provider_id = provider_row.id
            and booking.status = 'completed'
            and booking.status_changed_at >= months.month_start
            and booking.status_changed_at < months.month_start + interval '1 month'
        ),
        'workloadMinutes', coalesce((
          select sum(booking.duration_minutes) from public.service_booking_requests booking
          join public.workshops workshop on workshop.id = booking.workshop_id
          where workshop.service_provider_id = provider_row.id
            and coalesce(booking.confirmed_start, booking.preferred_start) >= months.month_start
            and coalesce(booking.confirmed_start, booking.preferred_start) < months.month_start + interval '1 month'
            and booking.status not in ('declined', 'cancelled', 'no_show')
        ), 0),
        'revenueByCurrency', coalesce((
          select jsonb_object_agg(revenue.currency, revenue.total_cents)
          from (
            select record.invoice_currency as currency, sum(record.invoice_total_cents) as total_cents
            from public.vehicle_service_records record
            join public.service_booking_requests booking on booking.id = record.booking_request_id
            join public.workshops workshop on workshop.id = booking.workshop_id
            where workshop.service_provider_id = provider_row.id
              and record.invoice_total_cents is not null
              and coalesce(record.invoice_issued_on, booking.status_changed_at::date) >= months.month_start::date
              and coalesce(record.invoice_issued_on, booking.status_changed_at::date) < (months.month_start + interval '1 month')::date
            group by record.invoice_currency
          ) revenue
        ), '{}'::jsonb),
        'cancellationRate', coalesce((
          select round(100.0 * count(*) filter (where booking.status = 'cancelled') / nullif(count(*), 0), 1)
          from public.service_booking_requests booking
          join public.workshops workshop on workshop.id = booking.workshop_id
          where workshop.service_provider_id = provider_row.id
            and booking.preferred_start >= months.month_start
            and booking.preferred_start < months.month_start + interval '1 month'
        ), 0),
        'averageRating', (
          select round(avg(feedback.rating)::numeric, 2)
          from public.service_booking_feedback feedback
          join public.workshops workshop on workshop.id = feedback.workshop_id
          where workshop.service_provider_id = provider_row.id
            and feedback.created_at >= months.month_start
            and feedback.created_at < months.month_start + interval '1 month'
        )
      ) order by months.month_start desc)
      from (
        select generate_series(
          current_month - make_interval(months => month_count - 1),
          current_month,
          interval '1 month'
        ) as month_start
      ) months
    ), '[]'::jsonb)
  ) into dashboard;
  return dashboard;
end;
$$;

revoke all on function public.get_service_organisation_operational_dashboard(uuid, integer)
  from public, anon;
grant execute on function public.get_service_organisation_operational_dashboard(uuid, integer)
  to authenticated;

comment on table public.service_booking_feedback is
  'Customer-owned rating for a completed workshop booking, used in owner-only location reporting.';
comment on function public.get_service_organisation_operational_dashboard(uuid, integer) is
  'Owner-only multi-location operational dashboard; regular workshop managers cannot execute it for their provider.';

commit;
