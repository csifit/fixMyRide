begin;

create type public.provider_subscription_status as enum (
  'not_started', 'incomplete', 'incomplete_expired', 'trialing', 'active',
  'past_due', 'canceled', 'unpaid', 'paused'
);

create table public.service_provider_billing_profiles (
  service_provider_id uuid primary key
    references public.service_providers(id) on delete restrict,
  billing_email text check (billing_email is null or char_length(billing_email) between 3 and 320),
  billing_contact text check (billing_contact is null or char_length(billing_contact) between 2 and 160),
  tax_identifier text check (tax_identifier is null or char_length(tax_identifier) between 2 and 80),
  address_line1 text check (address_line1 is null or char_length(address_line1) between 3 and 240),
  address_line2 text check (address_line2 is null or char_length(address_line2) between 2 and 240),
  city text check (city is null or char_length(city) between 2 and 120),
  postal_code text check (postal_code is null or char_length(postal_code) between 2 and 24),
  country_code char(2) not null default 'RO' check (country_code = upper(country_code)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger service_provider_billing_profiles_updated_at
before update on public.service_provider_billing_profiles
for each row execute function public.set_updated_at();

create table public.provider_subscriptions (
  service_provider_id uuid primary key
    references public.service_providers(id) on delete restrict,
  plan_id text not null default 'standard'
    references public.provider_subscription_plans(id) on delete restrict,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status public.provider_subscription_status not null default 'not_started',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  last_stripe_event_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (stripe_customer_id is null or stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  check (stripe_subscription_id is null or stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  check (stripe_price_id is null or stripe_price_id ~ '^price_[A-Za-z0-9]+$'),
  check (current_period_end is null or current_period_start is null or current_period_end > current_period_start)
);

create trigger provider_subscriptions_updated_at
before update on public.provider_subscriptions
for each row execute function public.set_updated_at();

create table public.provider_invoices (
  id uuid primary key default gen_random_uuid(),
  service_provider_id uuid not null
    references public.service_providers(id) on delete restrict,
  stripe_invoice_id text not null unique check (stripe_invoice_id ~ '^in_[A-Za-z0-9]+$'),
  stripe_subscription_id text,
  invoice_number text,
  status text not null check (status in ('draft', 'open', 'paid', 'uncollectible', 'void')),
  currency char(3) not null check (currency = upper(currency)),
  amount_due_cents bigint not null check (amount_due_cents >= 0),
  amount_paid_cents bigint not null check (amount_paid_cents >= 0),
  hosted_invoice_url text check (hosted_invoice_url is null or hosted_invoice_url ~ '^https://'),
  invoice_pdf_url text check (invoice_pdf_url is null or invoice_pdf_url ~ '^https://'),
  period_start timestamptz,
  period_end timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  last_stripe_event_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start)
);

create index provider_invoices_provider_idx
  on public.provider_invoices(service_provider_id, period_start desc, created_at desc);

create trigger provider_invoices_updated_at
before update on public.provider_invoices
for each row execute function public.set_updated_at();

create function private.initialize_service_provider_commercial_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.service_provider_billing_profiles (service_provider_id, country_code)
  values (new.id, new.country_code) on conflict (service_provider_id) do nothing;
  insert into public.provider_subscriptions (service_provider_id)
  values (new.id) on conflict (service_provider_id) do nothing;
  return new;
end;
$$;

revoke all on function private.initialize_service_provider_commercial_records()
  from public, anon, authenticated;

create trigger service_providers_initialize_commercial_records
after insert on public.service_providers
for each row execute function private.initialize_service_provider_commercial_records();

create table public.stripe_webhook_receipts (
  stripe_event_id text primary key check (stripe_event_id ~ '^evt_[A-Za-z0-9]+$'),
  event_type text not null check (char_length(event_type) between 3 and 120),
  stripe_created_at timestamptz not null,
  livemode boolean not null,
  api_version text,
  processed_at timestamptz not null default now()
);

create table public.service_provider_status_history (
  id uuid primary key default gen_random_uuid(),
  service_provider_id uuid not null references public.service_providers(id) on delete restrict,
  previous_status public.organization_status not null,
  new_status public.organization_status not null,
  reason text not null check (char_length(btrim(reason)) between 2 and 500),
  actor_administrator_id uuid not null
    references public.application_administrators(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (previous_status <> new_status)
);

create index service_provider_status_history_provider_idx
  on public.service_provider_status_history(service_provider_id, created_at desc);

create trigger service_provider_status_history_immutable
before update or delete on public.service_provider_status_history
for each row execute function private.prevent_service_booking_history_mutation();

insert into public.service_provider_billing_profiles (service_provider_id, country_code)
select provider.id, provider.country_code from public.service_providers provider
on conflict (service_provider_id) do nothing;

insert into public.provider_subscriptions (service_provider_id)
select provider.id from public.service_providers provider
on conflict (service_provider_id) do nothing;

alter table public.service_provider_billing_profiles enable row level security;
alter table public.provider_subscriptions enable row level security;
alter table public.provider_invoices enable row level security;
alter table public.stripe_webhook_receipts enable row level security;
alter table public.service_provider_status_history enable row level security;

revoke all on table public.service_provider_billing_profiles,
  public.provider_subscriptions, public.provider_invoices,
  public.stripe_webhook_receipts, public.service_provider_status_history
from public, anon, authenticated;

create function private.can_manage_provider_billing(requested_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workshop_manager_memberships membership
    join public.workshop_manager_profiles manager
      on manager.id = membership.workshop_manager_id and manager.status = 'active'
    where membership.service_provider_id = requested_provider_id
      and membership.membership_role = 'owner'
      and membership.status = 'active'
      and manager.auth_user_id = (select auth.uid())
  )
$$;

revoke all on function private.can_manage_provider_billing(uuid)
  from public, anon, authenticated;

create function private.has_accounting_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.jwt()->>'aal') = 'aal2'
    and exists (
      select 1 from public.application_administrators administrator
      where administrator.auth_user_id = (select auth.uid())
        and administrator.status = 'active'
        and (administrator.role::text in ('superadmin', 'admin') or administrator.accounting_access)
    )
$$;

revoke all on function private.has_accounting_access()
  from public, anon, authenticated;

create function public.get_my_provider_billing(requested_provider_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not private.can_manage_provider_billing(requested_provider_id) then
    raise exception 'Service provider owner access required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'providerId', provider.id, 'legalName', provider.legal_name,
    'displayName', provider.display_name, 'providerStatus', provider.status,
    'billingProfile', jsonb_build_object(
      'billingEmail', profile.billing_email, 'billingContact', profile.billing_contact,
      'taxIdentifier', profile.tax_identifier, 'addressLine1', profile.address_line1,
      'addressLine2', profile.address_line2, 'city', profile.city,
      'postalCode', profile.postal_code, 'countryCode', profile.country_code
    ),
    'plan', jsonb_build_object(
      'id', plan.id, 'name', plan.name, 'monthlyPriceCents', plan.monthly_price_cents,
      'currency', plan.currency, 'smsIncluded', plan.sms_included
    ),
    'subscription', jsonb_build_object(
      'status', subscription.status, 'stripeCustomerId', subscription.stripe_customer_id,
      'stripeSubscriptionId', subscription.stripe_subscription_id,
      'currentPeriodStart', subscription.current_period_start,
      'currentPeriodEnd', subscription.current_period_end,
      'cancelAtPeriodEnd', subscription.cancel_at_period_end,
      'canceledAt', subscription.canceled_at
    ),
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', invoice.id, 'number', invoice.invoice_number, 'status', invoice.status,
        'currency', invoice.currency, 'amountDueCents', invoice.amount_due_cents,
        'amountPaidCents', invoice.amount_paid_cents,
        'hostedInvoiceUrl', invoice.hosted_invoice_url,
        'invoicePdfUrl', invoice.invoice_pdf_url,
        'periodStart', invoice.period_start, 'periodEnd', invoice.period_end,
        'dueAt', invoice.due_at, 'paidAt', invoice.paid_at
      ) order by invoice.period_start desc nulls last, invoice.created_at desc)
      from public.provider_invoices invoice
      where invoice.service_provider_id = provider.id
    ), '[]'::jsonb)
  ) into result
  from public.service_providers provider
  join public.service_provider_billing_profiles profile on profile.service_provider_id = provider.id
  join public.provider_subscriptions subscription on subscription.service_provider_id = provider.id
  join public.provider_subscription_plans plan on plan.id = subscription.plan_id
  where provider.id = requested_provider_id;
  return result;
end;
$$;

revoke all on function public.get_my_provider_billing(uuid)
  from public, anon, authenticated;
grant execute on function public.get_my_provider_billing(uuid) to authenticated;

create function public.update_my_provider_billing_profile(
  requested_provider_id uuid, new_billing_email text, new_billing_contact text,
  new_tax_identifier text, new_address_line1 text, new_address_line2 text,
  new_city text, new_postal_code text, new_country_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_provider_billing(requested_provider_id) then
    raise exception 'Service provider owner access required' using errcode = '42501';
  end if;
  insert into public.service_provider_billing_profiles (
    service_provider_id, billing_email, billing_contact, tax_identifier,
    address_line1, address_line2, city, postal_code, country_code
  ) values (
    requested_provider_id, nullif(lower(btrim(new_billing_email)), ''),
    nullif(btrim(new_billing_contact), ''), nullif(btrim(new_tax_identifier), ''),
    nullif(btrim(new_address_line1), ''), nullif(btrim(new_address_line2), ''),
    nullif(btrim(new_city), ''), nullif(btrim(new_postal_code), ''),
    upper(btrim(new_country_code))
  ) on conflict (service_provider_id) do update set
    billing_email = excluded.billing_email, billing_contact = excluded.billing_contact,
    tax_identifier = excluded.tax_identifier, address_line1 = excluded.address_line1,
    address_line2 = excluded.address_line2, city = excluded.city,
    postal_code = excluded.postal_code, country_code = excluded.country_code;
end;
$$;

revoke all on function public.update_my_provider_billing_profile(
  uuid, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.update_my_provider_billing_profile(
  uuid, text, text, text, text, text, text, text, text
) to authenticated;

create function public.attach_provider_stripe_customer(
  requested_provider_id uuid, requested_stripe_customer_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if requested_stripe_customer_id !~ '^cus_[A-Za-z0-9]+$'
    or not exists (select 1 from public.service_providers where id = requested_provider_id) then
    raise exception 'Service provider billing is unavailable' using errcode = '23503';
  end if;
  insert into public.provider_subscriptions (service_provider_id, stripe_customer_id)
  values (requested_provider_id, requested_stripe_customer_id)
  on conflict (service_provider_id) do update set
    stripe_customer_id = excluded.stripe_customer_id
  where provider_subscriptions.stripe_customer_id is null
    or provider_subscriptions.stripe_customer_id = excluded.stripe_customer_id;
  if not found then raise exception 'Stripe customer is already linked' using errcode = '23505'; end if;
end;
$$;

revoke all on function public.attach_provider_stripe_customer(uuid, text)
  from public, anon, authenticated;
grant execute on function public.attach_provider_stripe_customer(uuid, text) to service_role;

create function public.apply_stripe_checkout_event(
  requested_event_id text, requested_event_type text, requested_event_created_at timestamptz,
  requested_livemode boolean, requested_api_version text, requested_provider_id uuid,
  requested_customer_id text, requested_subscription_id text
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
  if not exists (select 1 from public.service_providers where id = requested_provider_id) then
    raise exception 'Stripe provider metadata is invalid' using errcode = '23503';
  end if;
  insert into public.provider_subscriptions (
    service_provider_id, stripe_customer_id, stripe_subscription_id,
    status, last_stripe_event_created_at
  ) values (
    requested_provider_id, requested_customer_id, requested_subscription_id,
    'incomplete', requested_event_created_at
  ) on conflict (service_provider_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    last_stripe_event_created_at = excluded.last_stripe_event_created_at
  where provider_subscriptions.last_stripe_event_created_at is null
    or provider_subscriptions.last_stripe_event_created_at <= excluded.last_stripe_event_created_at;
  return true;
end;
$$;

create function public.apply_stripe_subscription_event(
  requested_event_id text, requested_event_type text, requested_event_created_at timestamptz,
  requested_livemode boolean, requested_api_version text, requested_provider_id uuid,
  requested_customer_id text, requested_subscription_id text, requested_price_id text,
  requested_status text, requested_period_start timestamptz, requested_period_end timestamptz,
  requested_cancel_at_period_end boolean, requested_canceled_at timestamptz
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
  if requested_status not in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused') then
    raise exception 'Unsupported Stripe subscription status' using errcode = '22023';
  end if;
  select subscription.service_provider_id into resolved_provider_id
  from public.provider_subscriptions subscription
  where subscription.stripe_subscription_id = requested_subscription_id
    or subscription.stripe_customer_id = requested_customer_id
  limit 1;
  resolved_provider_id := coalesce(resolved_provider_id, requested_provider_id);
  if resolved_provider_id is null
    or (requested_provider_id is not null and resolved_provider_id <> requested_provider_id) then
    raise exception 'Stripe subscription cannot be linked to a provider' using errcode = '23503';
  end if;
  insert into public.provider_subscriptions (
    service_provider_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
    status, current_period_start, current_period_end, cancel_at_period_end,
    canceled_at, last_stripe_event_created_at
  ) values (
    resolved_provider_id, requested_customer_id, requested_subscription_id,
    requested_price_id, requested_status::public.provider_subscription_status,
    requested_period_start, requested_period_end,
    coalesce(requested_cancel_at_period_end, false), requested_canceled_at,
    requested_event_created_at
  ) on conflict (service_provider_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_price_id = excluded.stripe_price_id, status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    canceled_at = excluded.canceled_at,
    last_stripe_event_created_at = excluded.last_stripe_event_created_at
  where provider_subscriptions.last_stripe_event_created_at is null
    or provider_subscriptions.last_stripe_event_created_at <= excluded.last_stripe_event_created_at;
  return true;
end;
$$;

create function public.apply_stripe_invoice_event(
  requested_event_id text, requested_event_type text, requested_event_created_at timestamptz,
  requested_livemode boolean, requested_api_version text, requested_customer_id text,
  requested_subscription_id text, requested_invoice_id text, requested_invoice_number text,
  requested_status text, requested_currency text, requested_amount_due bigint,
  requested_amount_paid bigint, requested_hosted_url text, requested_pdf_url text,
  requested_period_start timestamptz, requested_period_end timestamptz,
  requested_due_at timestamptz, requested_paid_at timestamptz
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
  select subscription.service_provider_id into resolved_provider_id
  from public.provider_subscriptions subscription
  where subscription.stripe_subscription_id = requested_subscription_id
    or subscription.stripe_customer_id = requested_customer_id
  limit 1;
  if resolved_provider_id is null then
    raise exception 'Stripe invoice subscription is unknown' using errcode = '23503';
  end if;
  insert into public.provider_invoices (
    service_provider_id, stripe_invoice_id, stripe_subscription_id,
    invoice_number, status, currency, amount_due_cents, amount_paid_cents,
    hosted_invoice_url, invoice_pdf_url, period_start, period_end,
    due_at, paid_at, last_stripe_event_created_at
  ) values (
    resolved_provider_id, requested_invoice_id, requested_subscription_id,
    requested_invoice_number, requested_status, upper(requested_currency),
    requested_amount_due, requested_amount_paid, requested_hosted_url,
    requested_pdf_url, requested_period_start, requested_period_end,
    requested_due_at, requested_paid_at, requested_event_created_at
  ) on conflict (stripe_invoice_id) do update set
    invoice_number = excluded.invoice_number, status = excluded.status,
    amount_due_cents = excluded.amount_due_cents,
    amount_paid_cents = excluded.amount_paid_cents,
    hosted_invoice_url = excluded.hosted_invoice_url,
    invoice_pdf_url = excluded.invoice_pdf_url,
    period_start = excluded.period_start, period_end = excluded.period_end,
    due_at = excluded.due_at, paid_at = excluded.paid_at,
    last_stripe_event_created_at = excluded.last_stripe_event_created_at
  where provider_invoices.last_stripe_event_created_at <= excluded.last_stripe_event_created_at;
  return true;
end;
$$;

revoke all on function public.apply_stripe_checkout_event(text, text, timestamptz, boolean, text, uuid, text, text),
  public.apply_stripe_subscription_event(text, text, timestamptz, boolean, text, uuid, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz),
  public.apply_stripe_invoice_event(text, text, timestamptz, boolean, text, text, text, text, text, text, text, bigint, bigint, text, text, timestamptz, timestamptz, timestamptz, timestamptz)
from public, anon, authenticated;
grant execute on function public.apply_stripe_checkout_event(text, text, timestamptz, boolean, text, uuid, text, text),
  public.apply_stripe_subscription_event(text, text, timestamptz, boolean, text, uuid, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz),
  public.apply_stripe_invoice_event(text, text, timestamptz, boolean, text, text, text, text, text, text, text, bigint, bigint, text, text, timestamptz, timestamptz, timestamptz, timestamptz)
to service_role;

create function public.get_provider_commercial_admin()
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
      'activeSubscriptions', count(*) filter (where subscription.status in ('active', 'trialing')),
      'attention', count(*) filter (where subscription.status in ('incomplete', 'past_due', 'unpaid')),
      'monthlyRecurringCents', coalesce(sum(plan.monthly_price_cents) filter (where subscription.status in ('active', 'trialing')), 0)
    ),
    'providers', coalesce(jsonb_agg(jsonb_build_object(
      'id', provider.id, 'legalName', provider.legal_name,
      'displayName', provider.display_name, 'countryCode', provider.country_code,
      'providerStatus', provider.status, 'subscriptionStatus', subscription.status,
      'monthlyPriceCents', plan.monthly_price_cents, 'currency', plan.currency,
      'currentPeriodEnd', subscription.current_period_end,
      'cancelAtPeriodEnd', subscription.cancel_at_period_end,
      'billingEmail', profile.billing_email,
      'invoiceCount', (select count(*) from public.provider_invoices invoice where invoice.service_provider_id = provider.id),
      'lastInvoiceStatus', (select invoice.status from public.provider_invoices invoice where invoice.service_provider_id = provider.id order by invoice.created_at desc limit 1)
    ) order by provider.display_name), '[]'::jsonb)
  ) into result
  from public.service_providers provider
  join public.provider_subscriptions subscription on subscription.service_provider_id = provider.id
  join public.provider_subscription_plans plan on plan.id = subscription.plan_id
  join public.service_provider_billing_profiles profile on profile.service_provider_id = provider.id;
  return result;
end;
$$;

revoke all on function public.get_provider_commercial_admin()
  from public, anon, authenticated;
grant execute on function public.get_provider_commercial_admin() to authenticated;

create function public.set_admin_service_provider_status(
  requested_provider_id uuid, requested_status text, requested_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid; previous_status public.organization_status; new_status public.organization_status;
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required' using errcode = '42501';
  end if;
  if requested_status not in ('pending', 'active', 'suspended', 'rejected')
    or char_length(btrim(coalesce(requested_reason, ''))) < 2 then
    raise exception 'A valid provider status and reason are required' using errcode = '22023';
  end if;
  new_status := requested_status::public.organization_status;
  select administrator.id into actor_id from public.application_administrators administrator
  where administrator.auth_user_id = (select auth.uid()) and administrator.status = 'active';
  select provider.status into previous_status from public.service_providers provider
  where provider.id = requested_provider_id for update;
  if previous_status is null then raise exception 'Service provider not found' using errcode = 'P0002'; end if;
  if previous_status = new_status then raise exception 'Provider status is unchanged' using errcode = '22023'; end if;
  update public.service_providers set status = new_status where id = requested_provider_id;
  if new_status <> 'active' then
    update public.workshops set status = 'suspended'
    where service_provider_id = requested_provider_id and status = 'active';
  end if;
  insert into public.service_provider_status_history (
    service_provider_id, previous_status, new_status, reason, actor_administrator_id
  ) values (requested_provider_id, previous_status, new_status, btrim(requested_reason), actor_id);
end;
$$;

revoke all on function public.set_admin_service_provider_status(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.set_admin_service_provider_status(uuid, text, text)
  to authenticated;

comment on table public.stripe_webhook_receipts is
  'Minimal idempotency ledger for signed Stripe events; raw payment payloads and card data are never stored.';
comment on table public.provider_subscriptions is
  'Stripe-synchronized accounting state. Payment status does not directly grant or revoke platform authorization.';

commit;
