begin;

-- One Stripe subscription now represents one service organisation. Individual
-- workshop rows remain the entitlement ledger so publication can still be
-- enabled or suspended per location.
alter table public.provider_subscriptions
  add column stripe_subscription_item_id text unique check (
    stripe_subscription_item_id is null
      or stripe_subscription_item_id ~ '^si_[A-Za-z0-9]+$'
  ),
  add column billing_quantity integer not null default 0
    check (billing_quantity between 0 and 10000),
  add column payment_method_confirmed_at timestamptz,
  add column payment_grace_ends_at timestamptz;

alter table public.workshop_subscriptions
  add column coverage_started_at timestamptz,
  add column billable_from date,
  add column coverage_ended_at timestamptz,
  add constraint workshop_subscription_coverage_dates check (
    coverage_ended_at is null or coverage_started_at is null
      or coverage_ended_at > coverage_started_at
  );

-- Existing organisation subscriptions already completed a Stripe collection
-- flow. Their external quantity is reconciled the next time billing changes.
update public.provider_subscriptions subscription
set payment_method_confirmed_at = coalesce(
      subscription.payment_method_confirmed_at,
      subscription.created_at
    )
where subscription.stripe_subscription_id is not null
  and subscription.status in ('active', 'trialing', 'past_due');

create or replace function private.has_workshop_billing_coverage(
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
    from public.workshop_subscriptions location_billing
    join public.workshops workshop
      on workshop.id = location_billing.workshop_id
    where location_billing.workshop_id = requested_workshop_id
      and (
        -- Preserve the temporary cutover coverage granted by migration 042.
        location_billing.coverage_grace_ends_at > now()
        or (
          location_billing.status in ('active', 'trialing')
          and (
            -- Compatibility for subscriptions created before consolidation.
            location_billing.stripe_subscription_id is not null
            or (
              location_billing.coverage_started_at is not null
              and location_billing.coverage_ended_at is null
              and exists (
                select 1
                from public.provider_subscriptions organisation_billing
                where organisation_billing.service_provider_id =
                    workshop.service_provider_id
                  and organisation_billing.payment_method_confirmed_at is not null
                  and (
                    (
                      organisation_billing.status in ('active', 'trialing')
                      and organisation_billing.payment_grace_ends_at is null
                    )
                    or (
                      organisation_billing.status in (
                        'active', 'trialing', 'past_due', 'unpaid'
                      )
                      and organisation_billing.payment_grace_ends_at > now()
                    )
                  )
                )
              )
            )
          )
      )
  )
$$;

revoke all on function private.has_workshop_billing_coverage(uuid)
  from public, anon, authenticated;

create function public.activate_provider_location_billing(
  requested_provider_id uuid,
  requested_workshop_id uuid,
  requested_subscription_id text,
  requested_subscription_item_id text,
  requested_quantity integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_quantity integer;
begin
  if requested_subscription_id !~ '^sub_[A-Za-z0-9]+$'
    or requested_subscription_item_id !~ '^si_[A-Za-z0-9]+$'
    or not exists (
      select 1 from public.workshops workshop
      where workshop.id = requested_workshop_id
        and workshop.service_provider_id = requested_provider_id
    ) then
    raise exception 'Organisation location billing is invalid'
      using errcode = '23503';
  end if;

  select count(*)::integer
    + case when exists (
        select 1 from public.workshop_subscriptions location_billing
        where location_billing.workshop_id = requested_workshop_id
          and location_billing.coverage_started_at is null
      ) then 1 else 0 end
  into expected_quantity
  from public.workshop_subscriptions location_billing
  join public.workshops workshop on workshop.id = location_billing.workshop_id
  where workshop.service_provider_id = requested_provider_id
    and location_billing.coverage_started_at is not null
    and location_billing.coverage_ended_at is null
    and location_billing.stripe_subscription_id is null;

  if requested_quantity <> expected_quantity then
    raise exception 'Stripe quantity does not match covered locations'
      using errcode = '23514';
  end if;

  update public.provider_subscriptions subscription
  set stripe_subscription_item_id = requested_subscription_item_id,
    billing_quantity = requested_quantity,
    payment_method_confirmed_at = coalesce(
      subscription.payment_method_confirmed_at, now()
    )
  where subscription.service_provider_id = requested_provider_id
    and subscription.stripe_subscription_id = requested_subscription_id;
  if not found then
    raise exception 'Organisation Stripe subscription is unavailable'
      using errcode = '23503';
  end if;

  update public.workshop_subscriptions location_billing
  set status = 'active',
    coverage_started_at = coalesce(location_billing.coverage_started_at, now()),
    billable_from = coalesce(
      location_billing.billable_from,
      (date_trunc('month', now() at time zone 'UTC') + interval '1 month')::date
    ),
    coverage_ended_at = null
  where location_billing.workshop_id = requested_workshop_id
    and location_billing.stripe_subscription_id is null;
  if not found then
    raise exception 'Location is already on legacy Stripe billing'
      using errcode = '23505';
  end if;
end;
$$;

revoke all on function public.activate_provider_location_billing(
  uuid, uuid, text, text, integer
) from public, anon, authenticated;
grant execute on function public.activate_provider_location_billing(
  uuid, uuid, text, text, integer
) to service_role;

create function public.prepare_provider_subscription_replacement(
  requested_provider_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.provider_subscriptions
  set stripe_subscription_id = null,
    stripe_subscription_item_id = null,
    stripe_price_id = null,
    billing_quantity = 0,
    payment_method_confirmed_at = null,
    payment_grace_ends_at = null,
    current_period_start = null,
    current_period_end = null,
    cancel_at_period_end = false,
    canceled_at = null,
    last_stripe_event_created_at = null,
    status = 'not_started'
  where service_provider_id = requested_provider_id
    and status in ('not_started', 'incomplete_expired', 'canceled');
  if not found then
    raise exception 'Live organisation subscription cannot be replaced'
      using errcode = '23505';
  end if;
end;
$$;

revoke all on function public.prepare_provider_subscription_replacement(uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_provider_subscription_replacement(uuid)
  to service_role;

create function public.apply_stripe_organisation_checkout_event(
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
    select 1 from public.workshops workshop
    join public.service_provider_stripe_customers customer
      on customer.service_provider_id = workshop.service_provider_id
    where workshop.id = requested_workshop_id
      and workshop.service_provider_id = requested_provider_id
      and customer.stripe_customer_id = requested_customer_id
  ) then
    raise exception 'Stripe organisation metadata is invalid'
      using errcode = '23503';
  end if;

  update public.provider_subscriptions subscription
  set stripe_customer_id = requested_customer_id,
    stripe_subscription_id = requested_subscription_id,
    payment_method_confirmed_at = requested_event_created_at,
    last_stripe_event_created_at = greatest(
      coalesce(subscription.last_stripe_event_created_at, '-infinity'),
      requested_event_created_at
    )
  where subscription.service_provider_id = requested_provider_id
    and (
      subscription.stripe_subscription_id is null
      or subscription.stripe_subscription_id = requested_subscription_id
    );
  if not found then
    raise exception 'Organisation Stripe subscription is already linked'
      using errcode = '23505';
  end if;

  update public.workshop_subscriptions location_billing
  set status = 'active', coverage_started_at = coalesce(
      location_billing.coverage_started_at, requested_event_created_at
    ),
    billable_from = coalesce(
      location_billing.billable_from,
      (date_trunc('month', requested_event_created_at at time zone 'UTC')
        + interval '1 month')::date
    ),
    coverage_ended_at = null
  where location_billing.workshop_id = requested_workshop_id
    and location_billing.stripe_subscription_id is null;

  update public.provider_subscriptions subscription
  set billing_quantity = (
    select count(*)::integer
    from public.workshop_subscriptions location_billing
    join public.workshops workshop on workshop.id = location_billing.workshop_id
    where workshop.service_provider_id = requested_provider_id
      and location_billing.coverage_started_at is not null
      and location_billing.coverage_ended_at is null
      and location_billing.stripe_subscription_id is null
  )
  where subscription.service_provider_id = requested_provider_id;
  return true;
end;
$$;

create function public.apply_stripe_organisation_subscription_event(
  requested_event_id text,
  requested_event_type text,
  requested_event_created_at timestamptz,
  requested_livemode boolean,
  requested_api_version text,
  requested_provider_id uuid,
  requested_customer_id text,
  requested_subscription_id text,
  requested_subscription_item_id text,
  requested_price_id text,
  requested_quantity integer,
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
declare resolved_provider_id uuid;
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
  ) or requested_quantity < 0 then
    raise exception 'Unsupported Stripe subscription state'
      using errcode = '22023';
  end if;

  select subscription.service_provider_id into resolved_provider_id
  from public.provider_subscriptions subscription
  where subscription.stripe_subscription_id = requested_subscription_id
    or subscription.stripe_customer_id = requested_customer_id
  limit 1;
  resolved_provider_id := coalesce(resolved_provider_id, requested_provider_id);
  if resolved_provider_id is null
    or (requested_provider_id is not null
      and resolved_provider_id <> requested_provider_id) then
    raise exception 'Stripe subscription cannot be linked to an organisation'
      using errcode = '23503';
  end if;

  update public.provider_subscriptions subscription
  set stripe_customer_id = requested_customer_id,
    stripe_subscription_id = requested_subscription_id,
    stripe_subscription_item_id = requested_subscription_item_id,
    stripe_price_id = requested_price_id,
    billing_quantity = requested_quantity,
    status = requested_status::public.provider_subscription_status,
    current_period_start = requested_period_start,
    current_period_end = requested_period_end,
    cancel_at_period_end = coalesce(requested_cancel_at_period_end, false),
    canceled_at = requested_canceled_at,
    payment_grace_ends_at = case
      when requested_status in ('past_due', 'unpaid') then coalesce(
        subscription.payment_grace_ends_at,
        requested_event_created_at + interval '15 days'
      )
      else subscription.payment_grace_ends_at
    end,
    last_stripe_event_created_at = requested_event_created_at
  where subscription.service_provider_id = resolved_provider_id
    and (
      subscription.stripe_subscription_id is null
      or subscription.stripe_subscription_id = requested_subscription_id
    )
    and (
      subscription.last_stripe_event_created_at is null
      or subscription.last_stripe_event_created_at <= requested_event_created_at
    );
  return true;
end;
$$;

revoke all on function public.apply_stripe_organisation_checkout_event(
  text, text, timestamptz, boolean, text, uuid, uuid, text, text
), public.apply_stripe_organisation_subscription_event(
  text, text, timestamptz, boolean, text, uuid, text, text, text, text,
  integer, text, timestamptz, timestamptz, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_stripe_organisation_checkout_event(
  text, text, timestamptz, boolean, text, uuid, uuid, text, text
), public.apply_stripe_organisation_subscription_event(
  text, text, timestamptz, boolean, text, uuid, text, text, text, text,
  integer, text, timestamptz, timestamptz, boolean, timestamptz
) to service_role;

-- Organisation invoices remain consolidated. A failed payment opens one
-- 15-day organisation grace window; successful payment clears it.
create or replace function public.apply_stripe_invoice_event(
  requested_event_id text, requested_event_type text,
  requested_event_created_at timestamptz, requested_livemode boolean,
  requested_api_version text, requested_customer_id text,
  requested_subscription_id text, requested_invoice_id text,
  requested_invoice_number text, requested_status text,
  requested_currency text, requested_amount_due bigint,
  requested_amount_paid bigint, requested_hosted_url text,
  requested_pdf_url text, requested_period_start timestamptz,
  requested_period_end timestamptz, requested_due_at timestamptz,
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

  select workshop.service_provider_id, workshop.id
    into resolved_provider_id, resolved_workshop_id
  from public.workshop_subscriptions location_billing
  join public.workshops workshop on workshop.id = location_billing.workshop_id
  where location_billing.stripe_subscription_id = requested_subscription_id;
  if resolved_provider_id is null then
    select subscription.service_provider_id into resolved_provider_id
    from public.provider_subscriptions subscription
    where subscription.stripe_subscription_id = requested_subscription_id
      or subscription.stripe_customer_id = requested_customer_id
    limit 1;
  end if;
  if resolved_provider_id is null then
    raise exception 'Stripe organisation invoice is unknown'
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
    workshop_id = excluded.workshop_id,
    invoice_number = excluded.invoice_number,
    status = excluded.status, amount_due_cents = excluded.amount_due_cents,
    amount_paid_cents = excluded.amount_paid_cents,
    hosted_invoice_url = excluded.hosted_invoice_url,
    invoice_pdf_url = excluded.invoice_pdf_url,
    period_start = excluded.period_start, period_end = excluded.period_end,
    due_at = excluded.due_at, paid_at = excluded.paid_at,
    last_stripe_event_created_at = excluded.last_stripe_event_created_at
  where provider_invoices.last_stripe_event_created_at
    <= excluded.last_stripe_event_created_at;

  if resolved_workshop_id is null
    and requested_event_type in (
      'invoice.payment_failed', 'invoice.payment_action_required'
    ) then
    update public.provider_subscriptions subscription
    set payment_grace_ends_at = coalesce(
      subscription.payment_grace_ends_at,
      requested_event_created_at + interval '15 days'
    )
    where subscription.service_provider_id = resolved_provider_id;
  elsif resolved_workshop_id is null
    and requested_status in ('paid', 'void')
    and not exists (
      select 1 from public.provider_invoices outstanding_invoice
      where outstanding_invoice.service_provider_id = resolved_provider_id
        and outstanding_invoice.workshop_id is null
        and outstanding_invoice.status in ('open', 'uncollectible')
    ) then
    update public.provider_subscriptions subscription
    set payment_grace_ends_at = null,
      status = case
        when requested_status = 'paid'
          and subscription.status in ('past_due', 'unpaid') then 'active'
        else subscription.status
      end
    where subscription.service_provider_id = resolved_provider_id;
  end if;
  return true;
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
    'providerId', provider.id, 'legalName', provider.legal_name,
    'displayName', provider.display_name,
    'providerStatus', provider.status,
    'stripeCustomerId', customer.stripe_customer_id,
    'billingProfile', jsonb_build_object(
      'billingEmail', profile.billing_email,
      'billingContact', profile.billing_contact,
      'taxIdentifier', profile.tax_identifier,
      'addressLine1', profile.address_line1,
      'addressLine2', profile.address_line2,
      'city', profile.city, 'postalCode', profile.postal_code,
      'countryCode', profile.country_code
    ),
    'plan', jsonb_build_object(
      'id', plan.id, 'name', plan.name,
      'monthlyPriceCents', plan.monthly_price_cents,
      'currency', plan.currency, 'smsIncluded', plan.sms_included
    ),
    'organisationSubscription', jsonb_build_object(
      'status', subscription.status,
      'stripeSubscriptionId', subscription.stripe_subscription_id,
      'stripeSubscriptionItemId', subscription.stripe_subscription_item_id,
      'billingQuantity', subscription.billing_quantity,
      'paymentMethodConfirmedAt', subscription.payment_method_confirmed_at,
      'paymentGraceEndsAt', subscription.payment_grace_ends_at,
      'currentPeriodStart', subscription.current_period_start,
      'currentPeriodEnd', subscription.current_period_end,
      'cancelAtPeriodEnd', subscription.cancel_at_period_end,
      'nextBillingAt', (date_trunc('month', now() at time zone 'UTC')
        + interval '1 month')::date,
      'upcomingAmountCents', (
        select count(*)::integer * plan.monthly_price_cents
        from public.workshop_subscriptions location_billing
        join public.workshops billed_workshop
          on billed_workshop.id = location_billing.workshop_id
        where billed_workshop.service_provider_id = provider.id
          and location_billing.coverage_started_at is not null
          and location_billing.coverage_ended_at is null
          and location_billing.stripe_subscription_id is null
      )
    ),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'workshopId', workshop.id,
        'displayName', workshop.display_name, 'city', workshop.city,
        'workshopStatus', workshop.status,
        'subscriptionStatus', location_billing.status,
        'legacyStripeSubscriptionId', location_billing.stripe_subscription_id,
        'coverageStartedAt', location_billing.coverage_started_at,
        'coverageGraceEndsAt', location_billing.coverage_grace_ends_at,
        'billableFrom', location_billing.billable_from,
        'coverageState', case
          when location_billing.stripe_subscription_id is not null
            and location_billing.status in ('active', 'trialing') then 'covered'
          when location_billing.coverage_started_at is null
            and location_billing.coverage_grace_ends_at > now() then 'grace'
          when location_billing.coverage_started_at is null then 'uncovered'
          when subscription.payment_grace_ends_at > now() then 'attention'
          when subscription.status in ('active', 'trialing')
            and subscription.payment_grace_ends_at is null then 'covered'
          when subscription.status in ('past_due', 'unpaid') then 'attention'
          else 'uncovered' end
      ) order by workshop.display_name)
      from public.workshops workshop
      join public.workshop_subscriptions location_billing
        on location_billing.workshop_id = workshop.id
      where workshop.service_provider_id = provider.id
    ), '[]'::jsonb),
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', invoice.id, 'number', invoice.invoice_number,
        'status', invoice.status, 'currency', invoice.currency,
        'amountDueCents', invoice.amount_due_cents,
        'amountPaidCents', invoice.amount_paid_cents,
        'hostedInvoiceUrl', invoice.hosted_invoice_url,
        'invoicePdfUrl', invoice.invoice_pdf_url,
        'periodStart', invoice.period_start, 'periodEnd', invoice.period_end,
        'dueAt', invoice.due_at, 'paidAt', invoice.paid_at
      ) order by invoice.period_start desc nulls last, invoice.created_at desc)
      from public.provider_invoices invoice
      where invoice.service_provider_id = provider.id
        and invoice.created_at >= date_trunc('month', now()) - interval '6 months'
    ), '[]'::jsonb)
  ) into result
  from public.service_providers provider
  join public.service_provider_billing_profiles profile
    on profile.service_provider_id = provider.id
  join public.provider_subscription_plans plan on plan.id = 'standard'
  join public.provider_subscriptions subscription
    on subscription.service_provider_id = provider.id
  join public.service_provider_stripe_customers customer
    on customer.service_provider_id = provider.id
  where provider.id = requested_provider_id;
  return result;
end;
$$;

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
      'providers', count(*),
      'locations', coalesce(sum(summary.location_count), 0),
      'activeSubscriptions', count(*) filter (
        where subscription.status in ('active', 'trialing')
      ),
      'attention', count(*) filter (
        where subscription.payment_grace_ends_at is not null
          or subscription.status in ('incomplete', 'past_due', 'unpaid')
      ),
      'monthlyRecurringCents', coalesce(sum(
        summary.location_count * plan.monthly_price_cents
      ), 0)
    ),
    'providers', coalesce(jsonb_agg(jsonb_build_object(
      'id', provider.id, 'displayName', provider.display_name,
      'legalName', provider.legal_name,
      'providerStatus', provider.status,
      'subscriptionStatus', subscription.status,
      'activeLocationCount', summary.location_count,
      'billingQuantity', subscription.billing_quantity,
      'monthlyPriceCents', plan.monthly_price_cents,
      'currency', plan.currency,
      'paymentGraceEndsAt', subscription.payment_grace_ends_at,
      'nextBillingAt', (date_trunc('month', now() at time zone 'UTC')
        + interval '1 month')::date,
      'upcomingAmountCents', summary.location_count * plan.monthly_price_cents,
      'invoices', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', invoice.id, 'number', invoice.invoice_number,
          'status', invoice.status, 'amountDueCents', invoice.amount_due_cents,
          'amountPaidCents', invoice.amount_paid_cents,
          'periodStart', invoice.period_start, 'periodEnd', invoice.period_end,
          'paidAt', invoice.paid_at
        ) order by invoice.period_start desc nulls last, invoice.created_at desc)
        from public.provider_invoices invoice
        where invoice.service_provider_id = provider.id
          and invoice.created_at >= date_trunc('month', now())
            - interval '6 months'
      ), '[]'::jsonb)
    ) order by provider.display_name), '[]'::jsonb)
  ) into result
  from public.service_providers provider
  join public.provider_subscriptions subscription
    on subscription.service_provider_id = provider.id
  join public.provider_subscription_plans plan on plan.id = subscription.plan_id
  cross join lateral (
    select count(*)::integer location_count
    from public.workshops workshop
    join public.workshop_subscriptions location_billing
      on location_billing.workshop_id = workshop.id
    where workshop.service_provider_id = provider.id
      and location_billing.coverage_started_at is not null
      and location_billing.coverage_ended_at is null
      and location_billing.stripe_subscription_id is null
  ) summary;
  return result;
end;
$$;

comment on table public.provider_subscriptions is
  'Canonical organisation-level Stripe subscription. billing_quantity is the number of consolidated covered locations charged together on the first of each month.';
comment on column public.provider_subscriptions.payment_grace_ends_at is
  'First failed organisation invoice opens one 15-day coverage grace window; successful payment clears it.';
comment on column public.workshop_subscriptions.billable_from is
  'First calendar month for which the location is included in consolidated organisation billing. Activation itself is free until this date.';

commit;
