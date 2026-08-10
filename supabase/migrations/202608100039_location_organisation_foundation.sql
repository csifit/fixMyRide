begin;

-- Expand-only foundation for multi-location service organisations. Existing
-- provider-level authorization, subscriptions, Stripe webhooks, and public
-- workshop publication remain authoritative until separately deployed cutovers.

create type public.platform_account_status as enum (
  'active', 'deactivated', 'blocked'
);

create type public.workshop_manager_assignment_role as enum (
  'primary_manager', 'manager'
);

create type public.workshop_manager_assignment_status as enum (
  'invited', 'active', 'suspended', 'ended'
);

create type public.service_provider_invitation_kind as enum (
  'organisation_owner', 'location_manager'
);

create type public.service_provider_invitation_status as enum (
  'pending', 'accepted', 'revoked', 'expired'
);

alter table public.account_identities
  add column status public.platform_account_status not null default 'active',
  add column status_changed_at timestamptz not null default now();

create table public.platform_account_status_history (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  previous_status public.platform_account_status not null,
  new_status public.platform_account_status not null,
  reason text not null check (char_length(btrim(reason)) between 2 and 500),
  changed_by_auth_user_id uuid not null
    references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (previous_status <> new_status)
);

create index platform_account_status_history_account_idx
  on public.platform_account_status_history(auth_user_id, created_at desc);

create function private.prevent_location_organisation_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Location organisation history is immutable'
    using errcode = '42501';
end;
$$;

revoke all on function private.prevent_location_organisation_history_mutation()
  from public, anon, authenticated;

create trigger platform_account_status_history_immutable
before update or delete on public.platform_account_status_history
for each row execute function private.prevent_location_organisation_history_mutation();

create table public.service_provider_invitations (
  id uuid primary key default gen_random_uuid(),
  service_provider_id uuid not null
    references public.service_providers(id) on delete restrict,
  workshop_id uuid references public.workshops(id) on delete restrict,
  invitation_kind public.service_provider_invitation_kind not null,
  intended_membership_role public.workshop_manager_membership_role not null,
  email text not null check (
    email = lower(btrim(email))
    and char_length(email) between 3 and 320
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  token_digest text not null unique check (token_digest ~ '^[a-f0-9]{64}$'),
  status public.service_provider_invitation_status not null default 'pending',
  invited_by_auth_user_id uuid not null
    references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by_auth_user_id uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (
    (invitation_kind = 'organisation_owner'
      and workshop_id is null and intended_membership_role = 'owner')
    or
    (invitation_kind = 'location_manager'
      and workshop_id is not null and intended_membership_role = 'manager')
  ),
  check (
    (status = 'accepted' and accepted_at is not null
      and accepted_by_auth_user_id is not null)
    or
    (status <> 'accepted' and accepted_at is null
      and accepted_by_auth_user_id is null)
  ),
  check (
    (status = 'revoked' and revoked_at is not null)
    or (status <> 'revoked' and revoked_at is null)
  )
);

create unique index service_provider_one_pending_invitation_idx
  on public.service_provider_invitations (
    service_provider_id,
    invitation_kind,
    coalesce(workshop_id, '00000000-0000-0000-0000-000000000000'::uuid),
    email
  ) where status = 'pending';

create index service_provider_invitations_expiry_idx
  on public.service_provider_invitations(status, expires_at)
  where status = 'pending';

create trigger service_provider_invitations_updated_at
before update on public.service_provider_invitations
for each row execute function public.set_updated_at();

create function private.validate_service_provider_invitation_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.workshop_id is not null and not exists (
    select 1 from public.workshops workshop
    where workshop.id = new.workshop_id
      and workshop.service_provider_id = new.service_provider_id
  ) then
    raise exception 'Invitation workshop does not belong to the service organisation'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_service_provider_invitation_scope()
  from public, anon, authenticated;

create trigger service_provider_invitations_validate_scope
before insert or update of service_provider_id, workshop_id
on public.service_provider_invitations
for each row execute function private.validate_service_provider_invitation_scope();

create table public.workshop_manager_assignments (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete restrict,
  workshop_manager_id uuid not null
    references public.workshop_manager_profiles(id) on delete restrict,
  assignment_role public.workshop_manager_assignment_role not null,
  status public.workshop_manager_assignment_status not null default 'active',
  invitation_id uuid references public.service_provider_invitations(id)
    on delete restrict,
  starts_on date not null default current_date,
  ends_before date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_before is null or ends_before > starts_on),
  check (status <> 'ended' or ends_before is not null)
);

create unique index workshop_manager_one_live_assignment_idx
  on public.workshop_manager_assignments(workshop_id, workshop_manager_id)
  where status in ('invited', 'active', 'suspended');

create unique index workshop_one_live_primary_manager_idx
  on public.workshop_manager_assignments(workshop_id)
  where assignment_role = 'primary_manager'
    and status in ('invited', 'active', 'suspended');

create index workshop_manager_assignments_manager_idx
  on public.workshop_manager_assignments(workshop_manager_id, status);

create trigger workshop_manager_assignments_updated_at
before update on public.workshop_manager_assignments
for each row execute function public.set_updated_at();

create function private.validate_workshop_manager_assignment_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare resolved_provider_id uuid;
begin
  select workshop.service_provider_id into resolved_provider_id
  from public.workshops workshop where workshop.id = new.workshop_id;

  if resolved_provider_id is null or not exists (
    select 1 from public.workshop_manager_memberships membership
    where membership.service_provider_id = resolved_provider_id
      and membership.workshop_manager_id = new.workshop_manager_id
      and membership.status in ('invited', 'active', 'suspended')
  ) then
    raise exception 'Manager is not a live member of the workshop organisation'
      using errcode = '23514';
  end if;

  if new.invitation_id is not null and not exists (
    select 1 from public.service_provider_invitations invitation
    where invitation.id = new.invitation_id
      and invitation.service_provider_id = resolved_provider_id
      and invitation.workshop_id = new.workshop_id
      and invitation.invitation_kind = 'location_manager'
  ) then
    raise exception 'Assignment invitation does not match the workshop'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_workshop_manager_assignment_scope()
  from public, anon, authenticated;

create trigger workshop_manager_assignments_validate_scope
before insert or update of workshop_id, workshop_manager_id, invitation_id
on public.workshop_manager_assignments
for each row execute function private.validate_workshop_manager_assignment_scope();

create table public.service_provider_stripe_customers (
  service_provider_id uuid primary key
    references public.service_providers(id) on delete restrict,
  stripe_customer_id text unique check (
    stripe_customer_id is null or stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger service_provider_stripe_customers_updated_at
before update on public.service_provider_stripe_customers
for each row execute function public.set_updated_at();

create function private.initialize_service_provider_stripe_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.service_provider_stripe_customers (service_provider_id)
  values (new.id) on conflict (service_provider_id) do nothing;
  return new;
end;
$$;

revoke all on function private.initialize_service_provider_stripe_customer()
  from public, anon, authenticated;

create trigger service_providers_initialize_stripe_customer
after insert on public.service_providers
for each row execute function private.initialize_service_provider_stripe_customer();

create function private.sync_service_provider_stripe_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.service_provider_stripe_customers (
    service_provider_id, stripe_customer_id
  ) values (new.service_provider_id, new.stripe_customer_id)
  on conflict (service_provider_id) do update
  set stripe_customer_id = excluded.stripe_customer_id;
  return new;
end;
$$;

revoke all on function private.sync_service_provider_stripe_customer()
  from public, anon, authenticated;

create trigger provider_subscriptions_sync_stripe_customer
after insert or update of stripe_customer_id on public.provider_subscriptions
for each row execute function private.sync_service_provider_stripe_customer();

insert into public.service_provider_stripe_customers (
  service_provider_id, stripe_customer_id
)
select subscription.service_provider_id, subscription.stripe_customer_id
from public.provider_subscriptions subscription
on conflict (service_provider_id) do update
set stripe_customer_id = excluded.stripe_customer_id;

create table public.workshop_subscriptions (
  workshop_id uuid primary key references public.workshops(id) on delete restrict,
  plan_id text not null default 'standard'
    references public.provider_subscription_plans(id) on delete restrict,
  stripe_subscription_id text unique check (
    stripe_subscription_id is null or stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'
  ),
  stripe_price_id text check (
    stripe_price_id is null or stripe_price_id ~ '^price_[A-Za-z0-9]+$'
  ),
  status public.provider_subscription_status not null default 'not_started',
  coverage_grace_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  last_stripe_event_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    current_period_end is null or current_period_start is null
      or current_period_end > current_period_start
  )
);

create index workshop_subscriptions_status_idx
  on public.workshop_subscriptions(status, current_period_end);

create trigger workshop_subscriptions_updated_at
before update on public.workshop_subscriptions
for each row execute function public.set_updated_at();

create function private.initialize_workshop_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workshop_subscriptions (workshop_id)
  values (new.id) on conflict (workshop_id) do nothing;
  return new;
end;
$$;

revoke all on function private.initialize_workshop_subscription()
  from public, anon, authenticated;

create trigger workshops_initialize_subscription
after insert on public.workshops
for each row execute function private.initialize_workshop_subscription();

insert into public.workshop_subscriptions (workshop_id)
select workshop.id from public.workshops workshop
on conflict (workshop_id) do nothing;

alter table public.provider_invoices
  add column workshop_id uuid references public.workshops(id) on delete restrict;

create index provider_invoices_workshop_idx
  on public.provider_invoices(workshop_id, period_start desc, created_at desc)
  where workshop_id is not null;

alter table public.platform_account_status_history enable row level security;
alter table public.service_provider_invitations enable row level security;
alter table public.workshop_manager_assignments enable row level security;
alter table public.service_provider_stripe_customers enable row level security;
alter table public.workshop_subscriptions enable row level security;

revoke all on table public.platform_account_status_history,
  public.service_provider_invitations,
  public.workshop_manager_assignments,
  public.service_provider_stripe_customers,
  public.workshop_subscriptions
from public, anon, authenticated;

comment on table public.workshop_manager_assignments is
  'Location-scoped manager responsibility. Existing provider-wide authorization remains authoritative until cutover.';
comment on table public.service_provider_invitations is
  'Hashed, expiring invitations for organisation owners and location managers; plaintext invitation tokens are never stored.';
comment on table public.workshop_subscriptions is
  'One shadow commercial record per workshop. Provider subscriptions and current Stripe handlers remain authoritative until billing cutover.';
comment on column public.workshop_subscriptions.coverage_grace_ends_at is
  'Optional rollout grace only; it never creates a Stripe charge and is not yet used for public eligibility.';
comment on column public.provider_invoices.workshop_id is
  'Nullable during provider-level billing compatibility; required for invoices created after location-billing cutover.';
comment on column public.account_identities.status is
  'Canonical account control for every platform role. Existing access checks remain unchanged until the account-control cutover.';

commit;
