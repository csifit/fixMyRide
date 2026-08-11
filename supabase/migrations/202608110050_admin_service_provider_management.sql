begin;

alter table public.service_providers
  add column main_email text check (
    main_email is null or char_length(main_email) between 3 and 320
  ),
  add column deleted_at timestamptz,
  add column deleted_by_administrator_id uuid
    references public.application_administrators(id) on delete restrict,
  add column deletion_reason text check (
    deletion_reason is null or char_length(deletion_reason) between 2 and 500
  ),
  add constraint service_providers_deletion_consistent check (
    (deleted_at is null and deleted_by_administrator_id is null
      and deletion_reason is null)
    or (deleted_at is not null and deleted_by_administrator_id is not null
      and deletion_reason is not null and status = 'rejected')
  );

alter table public.service_provider_billing_profiles
  add column vat_identifier text check (
    vat_identifier is null
      or char_length(vat_identifier) between 2 and 80
  ),
  add column registration_number text check (
    registration_number is null
      or char_length(registration_number) between 2 and 80
  );

update public.service_providers provider
set main_email = (
  select candidate.email
  from public.service_provider_invitations candidate
  where candidate.service_provider_id = provider.id
    and candidate.invitation_kind = 'organisation_owner'
  order by candidate.created_at
  limit 1
)
where provider.main_email is null
  and exists (
    select 1 from public.service_provider_invitations candidate
    where candidate.service_provider_id = provider.id
      and candidate.invitation_kind = 'organisation_owner'
  );

alter table public.platform_organisation_admin_history
  drop constraint platform_organisation_admin_history_action_check;
alter table public.platform_organisation_admin_history
  add constraint platform_organisation_admin_history_action_check check (action in (
    'organisation_invited', 'organisation_updated',
    'organisation_status_changed', 'organisation_deleted',
    'location_created', 'location_updated', 'location_coverage_assigned',
    'manager_invited', 'manager_assigned', 'account_status_changed'
  ));

create function public.get_admin_service_provider_details()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', provider.id,
    'legalName', provider.legal_name,
    'displayName', provider.display_name,
    'mainEmail', provider.main_email,
    'countryCode', provider.country_code,
    'status', provider.status,
    'createdAt', provider.created_at,
    'billingProfile', jsonb_build_object(
      'billingEmail', profile.billing_email,
      'billingContact', profile.billing_contact,
      'taxIdentifier', profile.tax_identifier,
      'vatIdentifier', profile.vat_identifier,
      'registrationNumber', profile.registration_number,
      'addressLine1', profile.address_line1,
      'addressLine2', profile.address_line2,
      'city', profile.city,
      'postalCode', profile.postal_code,
      'countryCode', profile.country_code
    ),
    'canDelete', not exists (
      select 1 from public.workshops workshop
      where workshop.service_provider_id = provider.id
    ) and not exists (
      select 1 from public.workshop_manager_memberships membership
      where membership.service_provider_id = provider.id
    ) and not exists (
      select 1 from public.provider_invoices invoice
      where invoice.service_provider_id = provider.id
    ) and coalesce(stripe_customer.stripe_customer_id, '') = ''
      and coalesce(legacy_subscription.stripe_customer_id, '') = ''
      and coalesce(legacy_subscription.stripe_subscription_id, '') = '',
    'deleteBlockers', to_jsonb(array_remove(array[
      case when exists (select 1 from public.workshops workshop
        where workshop.service_provider_id = provider.id) then 'locations' end,
      case when exists (select 1 from public.workshop_manager_memberships membership
        where membership.service_provider_id = provider.id) then 'managers' end,
      case when exists (select 1 from public.provider_invoices invoice
        where invoice.service_provider_id = provider.id) then 'invoices' end,
      case when coalesce(stripe_customer.stripe_customer_id, '') <> ''
        or coalesce(legacy_subscription.stripe_customer_id, '') <> ''
        or coalesce(legacy_subscription.stripe_subscription_id, '') <> ''
        then 'stripe' end
    ]::text[], null))
  ) order by provider.display_name), '[]'::jsonb)
  into result
  from public.service_providers provider
  join public.service_provider_billing_profiles profile
    on profile.service_provider_id = provider.id
  left join public.service_provider_stripe_customers stripe_customer
    on stripe_customer.service_provider_id = provider.id
  left join public.provider_subscriptions legacy_subscription
    on legacy_subscription.service_provider_id = provider.id
  where provider.deleted_at is null;

  return result;
end;
$$;

revoke all on function public.get_admin_service_provider_details()
  from public, anon, authenticated;
grant execute on function public.get_admin_service_provider_details()
  to authenticated;

create function public.update_admin_service_provider(
  requested_service_provider_id uuid,
  requested_legal_name text,
  requested_display_name text,
  requested_main_email text,
  requested_country_code text,
  requested_billing_email text,
  requested_billing_contact text,
  requested_tax_identifier text,
  requested_vat_identifier text,
  requested_registration_number text,
  requested_address_line1 text,
  requested_address_line2 text,
  requested_city text,
  requested_postal_code text,
  requested_billing_country_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  provider_row public.service_providers%rowtype;
  normalized_country text := upper(btrim(requested_country_code));
  normalized_billing_country text := upper(btrim(requested_billing_country_code));
  normalized_main_email text := nullif(lower(btrim(requested_main_email)), '');
  normalized_billing_email text := nullif(lower(btrim(requested_billing_email)), '');
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required'
      using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(requested_legal_name, ''))) not between 2 and 200
    or char_length(btrim(coalesce(requested_display_name, ''))) not between 2 and 160
    or normalized_country !~ '^[A-Z]{2}$'
    or normalized_billing_country !~ '^[A-Z]{2}$'
    or (normalized_main_email is not null
      and normalized_main_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    or (normalized_billing_email is not null
      and normalized_billing_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Valid service organisation details are required'
      using errcode = '22023';
  end if;

  select provider.* into provider_row
  from public.service_providers provider
  where provider.id = requested_service_provider_id
    and provider.deleted_at is null
  for update;
  if provider_row.id is null then
    raise exception 'Service organisation not found' using errcode = '22023';
  end if;

  update public.service_providers
  set legal_name = btrim(requested_legal_name),
    display_name = btrim(requested_display_name),
    main_email = normalized_main_email,
    country_code = normalized_country
  where id = provider_row.id;

  insert into public.service_provider_billing_profiles (
    service_provider_id, billing_email, billing_contact, tax_identifier,
    vat_identifier, registration_number, address_line1, address_line2, city, postal_code,
    country_code
  ) values (
    provider_row.id, normalized_billing_email,
    nullif(btrim(requested_billing_contact), ''),
    nullif(btrim(requested_tax_identifier), ''),
    nullif(btrim(requested_vat_identifier), ''),
    nullif(btrim(requested_registration_number), ''),
    nullif(btrim(requested_address_line1), ''),
    nullif(btrim(requested_address_line2), ''),
    nullif(btrim(requested_city), ''),
    nullif(btrim(requested_postal_code), ''),
    normalized_billing_country
  ) on conflict (service_provider_id) do update set
    billing_email = excluded.billing_email,
    billing_contact = excluded.billing_contact,
    tax_identifier = excluded.tax_identifier,
    vat_identifier = excluded.vat_identifier,
    registration_number = excluded.registration_number,
    address_line1 = excluded.address_line1,
    address_line2 = excluded.address_line2,
    city = excluded.city,
    postal_code = excluded.postal_code,
    country_code = excluded.country_code;

  actor_id := private.current_platform_administrator_id();
  insert into public.platform_organisation_admin_history (
    action, service_provider_id, actor_administrator_id, details
  ) values (
    'organisation_updated', provider_row.id, actor_id,
    jsonb_build_object(
      'previousLegalName', provider_row.legal_name,
      'legalName', btrim(requested_legal_name),
      'previousDisplayName', provider_row.display_name,
      'displayName', btrim(requested_display_name)
    )
  );
end;
$$;

revoke all on function public.update_admin_service_provider(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.update_admin_service_provider(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text
) to authenticated;

create function public.assign_admin_workshop_service_provider(
  requested_service_provider_id uuid,
  requested_workshop_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid;
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.service_providers provider
    where provider.id = requested_service_provider_id
      and provider.deleted_at is null
      and provider.status in ('pending', 'active')
  ) then
    raise exception 'Active service organisation not found' using errcode = '22023';
  end if;

  update public.workshops workshop
  set service_provider_id = requested_service_provider_id
  where workshop.id = requested_workshop_id
    and workshop.service_provider_id is null
    and workshop.creation_source = 'administrator';
  if not found then
    raise exception 'Only an unowned administrator location can be assigned'
      using errcode = '23503';
  end if;

  actor_id := private.current_platform_administrator_id();
  insert into public.platform_organisation_admin_history (
    action, service_provider_id, workshop_id, actor_administrator_id
  ) values (
    'location_coverage_assigned', requested_service_provider_id,
    requested_workshop_id, actor_id
  );
end;
$$;

revoke all on function public.assign_admin_workshop_service_provider(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.assign_admin_workshop_service_provider(uuid, uuid)
  to authenticated;

create or replace function public.set_admin_service_provider_status(
  requested_provider_id uuid,
  requested_status text,
  requested_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  previous_status public.organization_status;
  new_status public.organization_status;
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required'
      using errcode = '42501';
  end if;
  -- Preserve the existing commercial-admin contract while the provider
  -- accordion intentionally exposes only the reversible active/suspended pair.
  if requested_status not in ('pending', 'active', 'suspended', 'rejected')
    or char_length(btrim(coalesce(requested_reason, ''))) not between 2 and 500 then
    raise exception 'Valid organisation status and reason are required'
      using errcode = '22023';
  end if;
  new_status := requested_status::public.organization_status;

  select provider.status into previous_status
  from public.service_providers provider
  where provider.id = requested_provider_id
    and provider.deleted_at is null
  for update;
  if previous_status is null then
    raise exception 'Service organisation not found' using errcode = '22023';
  end if;
  if previous_status = new_status then
    raise exception 'Organisation status is unchanged' using errcode = '22023';
  end if;

  update public.service_providers
  set status = new_status
  where id = requested_provider_id;
  actor_id := private.current_platform_administrator_id();
  insert into public.service_provider_status_history (
    service_provider_id, previous_status, new_status, reason,
    actor_administrator_id
  ) values (
    requested_provider_id, previous_status, new_status,
    btrim(requested_reason), actor_id
  );
  insert into public.platform_organisation_admin_history (
    action, service_provider_id, actor_administrator_id, details
  ) values (
    'organisation_status_changed', requested_provider_id, actor_id,
    jsonb_build_object('previousStatus', previous_status,
      'status', new_status, 'reason', btrim(requested_reason))
  );
end;
$$;

revoke all on function public.set_admin_service_provider_status(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.set_admin_service_provider_status(uuid, text, text)
  to authenticated;

create function public.delete_admin_service_provider(
  requested_service_provider_id uuid,
  requested_confirmation text,
  requested_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  provider_row public.service_providers%rowtype;
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required'
      using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(requested_reason, ''))) not between 2 and 500 then
    raise exception 'A deletion reason is required' using errcode = '22023';
  end if;

  select provider.* into provider_row
  from public.service_providers provider
  where provider.id = requested_service_provider_id
    and provider.deleted_at is null
  for update;
  if provider_row.id is null
    or btrim(coalesce(requested_confirmation, '')) <> provider_row.display_name then
    raise exception 'Organisation name confirmation does not match'
      using errcode = '22023';
  end if;

  if exists (select 1 from public.workshops workshop
      where workshop.service_provider_id = provider_row.id)
    or exists (select 1 from public.workshop_manager_memberships membership
      where membership.service_provider_id = provider_row.id)
    or exists (select 1 from public.provider_invoices invoice
      where invoice.service_provider_id = provider_row.id)
    or exists (select 1 from public.service_provider_stripe_customers customer
      where customer.service_provider_id = provider_row.id
        and customer.stripe_customer_id is not null)
    or exists (select 1 from public.provider_subscriptions subscription
      where subscription.service_provider_id = provider_row.id
        and (subscription.stripe_customer_id is not null
          or subscription.stripe_subscription_id is not null)) then
    raise exception 'Organisation has dependent locations, managers, invoices, or Stripe records'
      using errcode = '23503';
  end if;

  actor_id := private.current_platform_administrator_id();
  update public.service_provider_invitations
  set status = 'revoked', revoked_at = coalesce(revoked_at, now())
  where service_provider_id = provider_row.id and status = 'pending';
  update public.provider_subscriptions
  set status = 'canceled', canceled_at = coalesce(canceled_at, now())
  where service_provider_id = provider_row.id and status = 'not_started';
  update public.service_providers
  set status = 'rejected', deleted_at = now(),
    deleted_by_administrator_id = actor_id,
    deletion_reason = btrim(requested_reason)
  where id = provider_row.id;
  insert into public.platform_organisation_admin_history (
    action, service_provider_id, actor_administrator_id, details
  ) values (
    'organisation_deleted', provider_row.id, actor_id,
    jsonb_build_object('displayName', provider_row.display_name,
      'reason', btrim(requested_reason), 'retention', 'billing_and_audit')
  );
end;
$$;

revoke all on function public.delete_admin_service_provider(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.delete_admin_service_provider(uuid, text, text)
  to authenticated;

comment on function public.delete_admin_service_provider(uuid, text, text) is
  'Archives an unused service organisation from active administration while retaining the database row for billing and immutable audit history. Dependency-bearing organisations cannot be deleted.';

commit;
