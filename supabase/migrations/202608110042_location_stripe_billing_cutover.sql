begin;

-- Existing organisation subscriptions are not copied to a location because one
-- Stripe subscription cannot safely represent several independently billed
-- locations. Covered organisations receive at least 30 days to migrate.
alter table public.workshop_subscriptions
  add column migration_grace_granted_at timestamptz,
  add column migrated_from_provider_subscription_id text check (
    migrated_from_provider_subscription_id is null
      or migrated_from_provider_subscription_id ~ '^sub_[A-Za-z0-9]+$'
  );

update public.workshop_subscriptions location_subscription
set coverage_grace_ends_at = greatest(
      coalesce(location_subscription.coverage_grace_ends_at, '-infinity'::timestamptz),
      now() + interval '30 days',
      coalesce(provider_subscription.current_period_end, '-infinity'::timestamptz)
    ),
    migration_grace_granted_at = now(),
    migrated_from_provider_subscription_id =
      provider_subscription.stripe_subscription_id
from public.workshops workshop
join public.provider_subscriptions provider_subscription
  on provider_subscription.service_provider_id = workshop.service_provider_id
where location_subscription.workshop_id = workshop.id
  and provider_subscription.status in ('active', 'trialing')
  and location_subscription.stripe_subscription_id is null;

create function private.has_workshop_billing_coverage(
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
    from public.workshop_subscriptions subscription
    where subscription.workshop_id = requested_workshop_id
      and (
        subscription.status in ('active', 'trialing')
        or subscription.coverage_grace_ends_at > now()
      )
  )
$$;

revoke all on function private.has_workshop_billing_coverage(uuid)
  from public, anon, authenticated;

-- The organisation remains the Stripe customer, but it is no longer the
-- subscription unit.
create or replace function public.attach_provider_stripe_customer(
  requested_provider_id uuid,
  requested_stripe_customer_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if requested_stripe_customer_id !~ '^cus_[A-Za-z0-9]+$'
    or not exists (
      select 1 from public.service_providers provider
      where provider.id = requested_provider_id
    ) then
    raise exception 'Service organisation billing is unavailable'
      using errcode = '23503';
  end if;

  insert into public.service_provider_stripe_customers (
    service_provider_id, stripe_customer_id
  ) values (
    requested_provider_id, requested_stripe_customer_id
  ) on conflict (service_provider_id) do update
  set stripe_customer_id = excluded.stripe_customer_id
  where service_provider_stripe_customers.stripe_customer_id is null
    or service_provider_stripe_customers.stripe_customer_id =
      excluded.stripe_customer_id;

  if not found then
    raise exception 'Stripe customer is already linked'
      using errcode = '23505';
  end if;
end;
$$;

create or replace function public.get_my_provider_billing(
  requested_provider_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not private.can_manage_service_organisation(requested_provider_id) then
    raise exception 'Service organisation owner access required'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'providerId', provider.id,
    'legalName', provider.legal_name,
    'displayName', provider.display_name,
    'providerStatus', provider.status,
    'stripeCustomerId', customer.stripe_customer_id,
    'billingProfile', jsonb_build_object(
      'billingEmail', profile.billing_email,
      'billingContact', profile.billing_contact,
      'taxIdentifier', profile.tax_identifier,
      'addressLine1', profile.address_line1,
      'addressLine2', profile.address_line2,
      'city', profile.city,
      'postalCode', profile.postal_code,
      'countryCode', profile.country_code
    ),
    'plan', jsonb_build_object(
      'id', plan.id,
      'name', plan.name,
      'monthlyPriceCents', plan.monthly_price_cents,
      'currency', plan.currency,
      'smsIncluded', plan.sms_included
    ),
    'legacySubscription', jsonb_build_object(
      'status', legacy.status,
      'stripeSubscriptionId', legacy.stripe_subscription_id,
      'currentPeriodEnd', legacy.current_period_end,
      'cancelAtPeriodEnd', legacy.cancel_at_period_end
    ),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'workshopId', workshop.id,
        'displayName', workshop.display_name,
        'city', workshop.city,
        'workshopStatus', workshop.status,
        'subscriptionStatus', subscription.status,
        'stripeSubscriptionId', subscription.stripe_subscription_id,
        'coverageGraceEndsAt', subscription.coverage_grace_ends_at,
        'currentPeriodEnd', subscription.current_period_end,
        'cancelAtPeriodEnd', subscription.cancel_at_period_end,
        'coverageState', case
          when subscription.status in ('active', 'trialing') then 'covered'
          when subscription.coverage_grace_ends_at > now() then 'grace'
          when subscription.status in ('incomplete', 'past_due', 'unpaid')
            then 'attention'
          else 'uncovered'
        end
      ) order by workshop.display_name)
      from public.workshops workshop
      join public.workshop_subscriptions subscription
        on subscription.workshop_id = workshop.id
      where workshop.service_provider_id = provider.id
    ), '[]'::jsonb),
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', invoice.id,
        'workshopId', invoice.workshop_id,
        'workshopName', workshop.display_name,
        'number', invoice.invoice_number,
        'status', invoice.status,
        'currency', invoice.currency,
        'amountDueCents', invoice.amount_due_cents,
        'amountPaidCents', invoice.amount_paid_cents,
        'hostedInvoiceUrl', invoice.hosted_invoice_url,
        'invoicePdfUrl', invoice.invoice_pdf_url,
        'periodStart', invoice.period_start,
        'periodEnd', invoice.period_end,
        'dueAt', invoice.due_at,
        'paidAt', invoice.paid_at
      ) order by invoice.period_start desc nulls last, invoice.created_at desc)
      from public.provider_invoices invoice
      left join public.workshops workshop on workshop.id = invoice.workshop_id
      where invoice.service_provider_id = provider.id
    ), '[]'::jsonb)
  ) into result
  from public.service_providers provider
  join public.service_provider_billing_profiles profile
    on profile.service_provider_id = provider.id
  join public.provider_subscription_plans plan on plan.id = 'standard'
  join public.provider_subscriptions legacy
    on legacy.service_provider_id = provider.id
  join public.service_provider_stripe_customers customer
    on customer.service_provider_id = provider.id
  where provider.id = requested_provider_id;

  return result;
end;
$$;

create function public.apply_stripe_location_checkout_event(
  requested_event_id text,
  requested_event_type text,
  requested_event_created_at timestamptz,
  requested_livemode boolean,
  requested_api_version text,
  requested_provider_id uuid,
  requested_workshop_id uuid,
  requested_customer_id text,
  requested_subscription_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stripe_webhook_receipts (
    stripe_event_id, event_type, stripe_created_at, livemode, api_version
  ) values (
    requested_event_id, requested_event_type, requested_event_created_at,
    requested_livemode, requested_api_version
  ) on conflict (stripe_event_id) do nothing;
  if not found then return false; end if;

  if not exists (
    select 1
    from public.workshops workshop
    join public.service_provider_stripe_customers customer
      on customer.service_provider_id = workshop.service_provider_id
    where workshop.id = requested_workshop_id
      and workshop.service_provider_id = requested_provider_id
      and customer.stripe_customer_id = requested_customer_id
  ) then
    raise exception 'Stripe location metadata is invalid'
      using errcode = '23503';
  end if;

  update public.workshop_subscriptions
  set stripe_subscription_id = requested_subscription_id,
    status = case
      when status in ('trialing', 'active', 'past_due', 'unpaid', 'paused')
        then status
      else 'incomplete'::public.provider_subscription_status
    end,
    last_stripe_event_created_at = requested_event_created_at
  where workshop_id = requested_workshop_id
    and (
      last_stripe_event_created_at is null
      or last_stripe_event_created_at <= requested_event_created_at
    );
  return true;
end;
$$;

create function public.apply_stripe_location_subscription_event(
  requested_event_id text,
  requested_event_type text,
  requested_event_created_at timestamptz,
  requested_livemode boolean,
  requested_api_version text,
  requested_provider_id uuid,
  requested_workshop_id uuid,
  requested_customer_id text,
  requested_subscription_id text,
  requested_price_id text,
  requested_status text,
  requested_period_start timestamptz,
  requested_period_end timestamptz,
  requested_cancel_at_period_end boolean,
  requested_canceled_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_workshop_id uuid;
begin
  insert into public.stripe_webhook_receipts (
    stripe_event_id, event_type, stripe_created_at, livemode, api_version
  ) values (
    requested_event_id, requested_event_type, requested_event_created_at,
    requested_livemode, requested_api_version
  ) on conflict (stripe_event_id) do nothing;
  if not found then return false; end if;

  if requested_status not in (
    'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due',
    'canceled', 'unpaid', 'paused'
  ) then
    raise exception 'Unsupported Stripe subscription status'
      using errcode = '22023';
  end if;

  select subscription.workshop_id into resolved_workshop_id
  from public.workshop_subscriptions subscription
  where subscription.stripe_subscription_id = requested_subscription_id;
  resolved_workshop_id := coalesce(resolved_workshop_id, requested_workshop_id);

  if resolved_workshop_id is null or not exists (
    select 1
    from public.workshops workshop
    join public.service_provider_stripe_customers customer
      on customer.service_provider_id = workshop.service_provider_id
    where workshop.id = resolved_workshop_id
      and workshop.service_provider_id = requested_provider_id
      and customer.stripe_customer_id = requested_customer_id
  ) then
    raise exception 'Stripe subscription cannot be linked to a location'
      using errcode = '23503';
  end if;

  update public.workshop_subscriptions
  set stripe_subscription_id = requested_subscription_id,
    stripe_price_id = requested_price_id,
    status = requested_status::public.provider_subscription_status,
    current_period_start = requested_period_start,
    current_period_end = requested_period_end,
    cancel_at_period_end = coalesce(requested_cancel_at_period_end, false),
    canceled_at = requested_canceled_at,
    last_stripe_event_created_at = requested_event_created_at
  where workshop_id = resolved_workshop_id
    and (
      last_stripe_event_created_at is null
      or last_stripe_event_created_at <= requested_event_created_at
    );
  return true;
end;
$$;

-- Invoice events use the Stripe subscription ID to choose the canonical
-- location subscription. Legacy organisation invoices remain readable with a
-- null workshop_id during the grace period.
create or replace function public.apply_stripe_invoice_event(
  requested_event_id text,
  requested_event_type text,
  requested_event_created_at timestamptz,
  requested_livemode boolean,
  requested_api_version text,
  requested_customer_id text,
  requested_subscription_id text,
  requested_invoice_id text,
  requested_invoice_number text,
  requested_status text,
  requested_currency text,
  requested_amount_due bigint,
  requested_amount_paid bigint,
  requested_hosted_url text,
  requested_pdf_url text,
  requested_period_start timestamptz,
  requested_period_end timestamptz,
  requested_due_at timestamptz,
  requested_paid_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_provider_id uuid;
  resolved_workshop_id uuid;
begin
  insert into public.stripe_webhook_receipts (
    stripe_event_id, event_type, stripe_created_at, livemode, api_version
  ) values (
    requested_event_id, requested_event_type, requested_event_created_at,
    requested_livemode, requested_api_version
  ) on conflict (stripe_event_id) do nothing;
  if not found then return false; end if;

  select workshop.id, workshop.service_provider_id
    into resolved_workshop_id, resolved_provider_id
  from public.workshop_subscriptions subscription
  join public.workshops workshop on workshop.id = subscription.workshop_id
  where subscription.stripe_subscription_id = requested_subscription_id;

  if resolved_provider_id is null then
    select subscription.service_provider_id into resolved_provider_id
    from public.provider_subscriptions subscription
    where subscription.stripe_subscription_id = requested_subscription_id
      or (
        requested_subscription_id is null
        and subscription.stripe_customer_id = requested_customer_id
      )
    limit 1;
  end if;
  if resolved_provider_id is null then
    raise exception 'Stripe invoice subscription is unknown'
      using errcode = '23503';
  end if;
  if not exists (
    select 1 from public.service_provider_stripe_customers customer
    where customer.service_provider_id = resolved_provider_id
      and customer.stripe_customer_id = requested_customer_id
  ) then
    raise exception 'Stripe invoice customer does not match the organisation'
      using errcode = '23503';
  end if;

  insert into public.provider_invoices (
    service_provider_id, workshop_id, stripe_invoice_id,
    stripe_subscription_id, invoice_number, status, currency,
    amount_due_cents, amount_paid_cents, hosted_invoice_url,
    invoice_pdf_url, period_start, period_end, due_at, paid_at,
    last_stripe_event_created_at
  ) values (
    resolved_provider_id, resolved_workshop_id, requested_invoice_id,
    requested_subscription_id, requested_invoice_number, requested_status,
    upper(requested_currency), requested_amount_due, requested_amount_paid,
    requested_hosted_url, requested_pdf_url, requested_period_start,
    requested_period_end, requested_due_at, requested_paid_at,
    requested_event_created_at
  ) on conflict (stripe_invoice_id) do update set
    service_provider_id = excluded.service_provider_id,
    workshop_id = excluded.workshop_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    invoice_number = excluded.invoice_number,
    status = excluded.status,
    amount_due_cents = excluded.amount_due_cents,
    amount_paid_cents = excluded.amount_paid_cents,
    hosted_invoice_url = excluded.hosted_invoice_url,
    invoice_pdf_url = excluded.invoice_pdf_url,
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    due_at = excluded.due_at,
    paid_at = excluded.paid_at,
    last_stripe_event_created_at = excluded.last_stripe_event_created_at
  where provider_invoices.last_stripe_event_created_at
    <= excluded.last_stripe_event_created_at;
  return true;
end;
$$;

revoke all on function public.apply_stripe_location_checkout_event(
  text, text, timestamptz, boolean, text, uuid, uuid, text, text
) from public, anon, authenticated;
revoke all on function public.apply_stripe_location_subscription_event(
  text, text, timestamptz, boolean, text, uuid, uuid, text, text, text,
  text, timestamptz, timestamptz, boolean, timestamptz
) from public, anon, authenticated;

grant execute on function public.apply_stripe_location_checkout_event(
  text, text, timestamptz, boolean, text, uuid, uuid, text, text
) to service_role;
grant execute on function public.apply_stripe_location_subscription_event(
  text, text, timestamptz, boolean, text, uuid, uuid, text, text, text,
  text, timestamptz, timestamptz, boolean, timestamptz
) to service_role;

create or replace function public.get_provider_commercial_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not private.has_accounting_access() then
    raise exception 'Accounting access required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'counts', jsonb_build_object(
      'providers', (select count(*) from public.service_providers),
      'locations', count(*),
      'activeSubscriptions', count(*) filter (
        where subscription.status in ('active', 'trialing')
      ),
      'attention', count(*) filter (
        where subscription.status in ('incomplete', 'past_due', 'unpaid')
      ),
      'monthlyRecurringCents', coalesce(sum(plan.monthly_price_cents) filter (
        where subscription.status in ('active', 'trialing')
      ), 0)
    ),
    'locations', coalesce(jsonb_agg(jsonb_build_object(
      'id', workshop.id,
      'providerId', provider.id,
      'providerName', provider.display_name,
      'providerStatus', provider.status,
      'displayName', workshop.display_name,
      'city', workshop.city,
      'workshopStatus', workshop.status,
      'subscriptionStatus', subscription.status,
      'coverageGraceEndsAt', subscription.coverage_grace_ends_at,
      'currentPeriodEnd', subscription.current_period_end,
      'cancelAtPeriodEnd', subscription.cancel_at_period_end,
      'monthlyPriceCents', plan.monthly_price_cents,
      'currency', plan.currency,
      'invoiceCount', (
        select count(*) from public.provider_invoices invoice
        where invoice.workshop_id = workshop.id
      ),
      'lastInvoiceStatus', (
        select invoice.status from public.provider_invoices invoice
        where invoice.workshop_id = workshop.id
        order by invoice.created_at desc limit 1
      )
    ) order by provider.display_name, workshop.display_name), '[]'::jsonb)
  ) into result
  from public.workshops workshop
  join public.service_providers provider
    on provider.id = workshop.service_provider_id
  join public.workshop_subscriptions subscription
    on subscription.workshop_id = workshop.id
  join public.provider_subscription_plans plan on plan.id = subscription.plan_id;

  return result;
end;
$$;

comment on table public.provider_subscriptions is
  'Legacy organisation-level Stripe state retained during location migration; it is no longer the subscription unit for new Checkout sessions.';
comment on table public.workshop_subscriptions is
  'Canonical Stripe subscription state: exactly one EUR 35 monthly subscription unit per workshop location, with time-bounded migration grace.';
comment on column public.workshop_subscriptions.coverage_grace_ends_at is
  'Temporary coverage granted during migration; new location Checkout uses this as trial_end to avoid overlapping charges.';

commit;
