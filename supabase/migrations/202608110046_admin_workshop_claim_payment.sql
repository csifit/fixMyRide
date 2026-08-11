begin;

create type public.workshop_creation_source as enum (
  'legacy', 'administrator', 'organisation_owner'
);
create type public.workshop_claim_status as enum (
  'not_applicable', 'unclaimed', 'awaiting_payment', 'claimed'
);

alter table public.workshops
  add column creation_source public.workshop_creation_source
    not null default 'legacy',
  add column claim_status public.workshop_claim_status
    not null default 'not_applicable',
  add column claim_requested_by_workshop_manager_id uuid
    references public.workshop_manager_profiles(id) on delete restrict,
  add column claim_requested_at timestamptz,
  add column claimed_at timestamptz,
  add constraint workshops_claim_state_consistent check (
    (claim_status in ('not_applicable', 'unclaimed')
      and claim_requested_by_workshop_manager_id is null
      and claim_requested_at is null)
    or (claim_status = 'awaiting_payment'
      and claim_requested_by_workshop_manager_id is not null
      and claim_requested_at is not null
      and claimed_at is null)
    or (claim_status = 'claimed'
      and claim_requested_by_workshop_manager_id is not null
      and claim_requested_at is not null
      and claimed_at is not null)
  );

-- Locations created through the administrator workflow are the only existing
-- rows that enter the claim process. Paid ones are retained as already claimed.
update public.workshops workshop
set creation_source = 'administrator',
  status = 'active',
  active_from = coalesce(workshop.active_from, current_date),
  ends_before = null,
  claim_status = case
    when subscription.status in ('active', 'trialing')
      then 'claimed'::public.workshop_claim_status
    else 'unclaimed'::public.workshop_claim_status
  end,
  claim_requested_by_workshop_manager_id = case
    when subscription.status in ('active', 'trialing') then primary_manager.id
  end,
  claim_requested_at = case
    when subscription.status in ('active', 'trialing') then workshop.created_at
  end,
  claimed_at = case
    when subscription.status in ('active', 'trialing') then now()
  end
from public.platform_organisation_admin_history history
join public.workshop_subscriptions subscription
  on subscription.workshop_id = history.workshop_id
left join lateral (
  select assignment.workshop_manager_id as id
  from public.workshop_manager_assignments assignment
  where assignment.workshop_id = history.workshop_id
    and assignment.status = 'active'
  order by (assignment.assignment_role = 'primary_manager') desc,
    assignment.created_at
  limit 1
) primary_manager on true
where history.action = 'location_created'
  and history.workshop_id = workshop.id
  and (
    subscription.status not in ('active', 'trialing')
    or primary_manager.id is not null
  );

alter table public.workshops
  alter column creation_source set default 'administrator',
  alter column claim_status set default 'unclaimed';

create function private.activate_administrator_workshop()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.creation_source = 'administrator' then
    new.status := 'active';
    new.active_from := coalesce(new.active_from, current_date);
    new.ends_before := null;
  end if;
  return new;
end;
$$;

revoke all on function private.activate_administrator_workshop()
  from public, anon, authenticated;
create trigger workshops_activate_administrator_location
before insert or update of creation_source on public.workshops
for each row execute function private.activate_administrator_workshop();

create function private.has_complete_service_provider_claim_details(
  requested_service_provider_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.service_providers provider
    join public.service_provider_billing_profiles profile
      on profile.service_provider_id = provider.id
    where provider.id = requested_service_provider_id
      and provider.status = 'active'
      and nullif(btrim(provider.legal_name), '') is not null
      and nullif(btrim(provider.display_name), '') is not null
      and nullif(btrim(profile.billing_email), '') is not null
      and nullif(btrim(profile.billing_contact), '') is not null
      and nullif(btrim(profile.tax_identifier), '') is not null
      and nullif(btrim(profile.address_line1), '') is not null
      and nullif(btrim(profile.city), '') is not null
      and nullif(btrim(profile.postal_code), '') is not null
  )
$$;

revoke all on function private.has_complete_service_provider_claim_details(uuid)
  from public, anon, authenticated;

create function public.get_public_workshop_claim(
  requested_workshop_id uuid
)
returns table (
  workshop_id uuid,
  display_name text,
  city text,
  practice_address text,
  country_code char(2),
  service_provider_name text,
  claim_status public.workshop_claim_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select workshop.id, workshop.display_name, workshop.city,
    workshop.address, workshop.country_code, provider.display_name,
    workshop.claim_status
  from public.workshops workshop
  join public.service_providers provider
    on provider.id = workshop.service_provider_id
  where workshop.id = requested_workshop_id
    and workshop.creation_source = 'administrator'
    and workshop.status in ('pending', 'active')
    and provider.status in ('pending', 'active')
$$;

revoke all on function public.get_public_workshop_claim(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_workshop_claim(uuid)
  to anon, authenticated;

create function public.begin_my_workshop_claim(
  requested_workshop_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  workshop_row public.workshops%rowtype;
  manager_id uuid;
  details_complete boolean;
  paid boolean;
begin
  select workshop.* into workshop_row
  from public.workshops workshop
  where workshop.id = requested_workshop_id
    and workshop.creation_source = 'administrator'
    and workshop.claim_status in ('unclaimed', 'awaiting_payment')
  for update;
  if workshop_row.id is null
    or not private.can_manage_service_organisation(
      workshop_row.service_provider_id
    ) then
    raise exception 'The linked service organisation owner is required'
      using errcode = '42501';
  end if;
  select manager.id into manager_id
  from public.workshop_manager_memberships membership
  join public.workshop_manager_profiles manager
    on manager.id = membership.workshop_manager_id
    and manager.status = 'active'
  join public.account_identities identity
    on identity.auth_user_id = manager.auth_user_id
    and identity.status = 'active'
  where membership.service_provider_id = workshop_row.service_provider_id
    and membership.membership_role = 'owner'
    and membership.status = 'active'
    and manager.auth_user_id = (select auth.uid())
  limit 1;

  details_complete := private.has_complete_service_provider_claim_details(
    workshop_row.service_provider_id
  );
  if not details_complete then
    return jsonb_build_object(
      'providerId', workshop_row.service_provider_id,
      'state', 'details_required'
    );
  end if;

  select subscription.status in ('active', 'trialing') into paid
  from public.workshop_subscriptions subscription
  where subscription.workshop_id = workshop_row.id;

  update public.workshops
  set claim_status = case when coalesce(paid, false)
      then 'claimed'::public.workshop_claim_status
      else 'awaiting_payment'::public.workshop_claim_status end,
    claim_requested_by_workshop_manager_id = manager_id,
    claim_requested_at = coalesce(claim_requested_at, now()),
    claimed_at = case when coalesce(paid, false)
      then coalesce(claimed_at, now()) else null end
  where id = workshop_row.id;

  return jsonb_build_object(
    'providerId', workshop_row.service_provider_id,
    'state', case when coalesce(paid, false)
      then 'claimed' else 'payment_required' end
  );
end;
$$;

revoke all on function public.begin_my_workshop_claim(uuid)
  from public, anon, authenticated;
grant execute on function public.begin_my_workshop_claim(uuid)
  to authenticated;

create function private.finalize_paid_workshop_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('active', 'trialing') then
    update public.workshops workshop
    set claim_status = 'claimed', claimed_at = coalesce(claimed_at, now())
    where workshop.id = new.workshop_id
      and workshop.creation_source = 'administrator'
      and workshop.claim_status = 'awaiting_payment'
      and private.has_complete_service_provider_claim_details(
        workshop.service_provider_id
      );
  end if;
  return new;
end;
$$;

revoke all on function private.finalize_paid_workshop_claim()
  from public, anon, authenticated;
create trigger workshop_subscriptions_finalize_paid_claim
after insert or update of status on public.workshop_subscriptions
for each row execute function private.finalize_paid_workshop_claim();

commit;

begin;

create or replace function private.is_workshop_publication_eligible(
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
    from public.workshops workshop
    join public.service_providers provider
      on provider.id = workshop.service_provider_id
      and provider.status = 'active'
    where workshop.id = requested_workshop_id
      and workshop.status in ('pending', 'active')
      and nullif(btrim(workshop.display_name), '') is not null
      and nullif(btrim(workshop.city), '') is not null
      and nullif(btrim(workshop.address), '') is not null
      and workshop.latitude between -90 and 90
      and workshop.longitude between -180 and 180
      and workshop.claim_status in ('not_applicable', 'claimed')
      and private.has_workshop_billing_coverage(workshop.id)
      and exists (
        select 1
        from public.workshop_manager_assignments assignment
        join public.workshop_manager_profiles manager
          on manager.id = assignment.workshop_manager_id
          and manager.status = 'active'
        join public.account_identities identity
          on identity.auth_user_id = manager.auth_user_id
          and identity.status = 'active'
        where assignment.workshop_id = workshop.id
          and assignment.assignment_role = 'primary_manager'
          and assignment.status = 'active'
          and assignment.starts_on <= current_date
          and (assignment.ends_before is null
            or assignment.ends_before > current_date)
      )
  )
$$;

create function private.is_workshop_discoverable(
  requested_workshop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_workshop_publication_eligible(requested_workshop_id)
    or exists (
      select 1
      from public.workshops workshop
      join public.service_providers provider
        on provider.id = workshop.service_provider_id
        and provider.status in ('pending', 'active')
      where workshop.id = requested_workshop_id
        and workshop.status = 'active'
        and workshop.creation_source = 'administrator'
        and workshop.claim_status in ('unclaimed', 'awaiting_payment')
        and nullif(btrim(workshop.display_name), '') is not null
        and nullif(btrim(workshop.city), '') is not null
        and nullif(btrim(workshop.address), '') is not null
        and workshop.latitude between -90 and 90
        and workshop.longitude between -180 and 180
    )
$$;

revoke all on function private.is_workshop_discoverable(uuid)
  from public, anon, authenticated;

create or replace function public.search_public_workshops(
  requested_search text default null
)
returns table (
  workshop_id uuid, display_name text, description text,
  country_code char(2), city text, practice_address text,
  latitude numeric, longitude numeric, public_phone text, public_email text,
  offers_pickup boolean, offers_courtesy_car boolean,
  service_categories text[], price_from_cents integer
)
language sql stable security definer set search_path = ''
as $$
  select workshop.id, workshop.display_name, workshop.description,
    workshop.country_code, workshop.city, workshop.address,
    workshop.latitude, workshop.longitude, workshop.public_phone,
    workshop.public_email, workshop.offers_pickup,
    workshop.offers_courtesy_car,
    coalesce(summary.categories, array[]::text[]), summary.price_from_cents
  from public.workshops workshop
  left join lateral (
    select array_agg(distinct service.category order by service.category)
        categories,
      min(service.price_from_cents) price_from_cents
    from public.workshop_services service
    where service.workshop_id = workshop.id and service.active
  ) summary on true
  where private.is_workshop_discoverable(workshop.id)
    and (nullif(btrim(requested_search), '') is null
      or concat_ws(' ', workshop.display_name, workshop.description,
        workshop.city, workshop.address,
        array_to_string(summary.categories, ' '))
        ilike '%' || btrim(requested_search) || '%')
  order by workshop.display_name
$$;

create or replace function public.create_my_workshop_location(
  requested_service_provider_id uuid,
  requested_display_name text,
  requested_country_code text,
  requested_city text,
  requested_address text,
  requested_latitude numeric,
  requested_longitude numeric,
  requested_public_phone text,
  requested_public_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  manager_id uuid;
  created_workshop_id uuid := gen_random_uuid();
  normalized_country text := upper(btrim(requested_country_code));
  generated_slug text;
begin
  if not private.can_manage_service_organisation(requested_service_provider_id)
    or not exists (
      select 1 from public.service_providers provider
      where provider.id = requested_service_provider_id
        and provider.status = 'active'
    ) then
    raise exception 'Active service organisation owner access required'
      using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(requested_display_name, ''))) not between 2 and 160
    or normalized_country !~ '^[A-Z]{2}$'
    or nullif(btrim(coalesce(requested_city, '')), '') is null
    or nullif(btrim(coalesce(requested_address, '')), '') is null
    or requested_latitude is null or requested_latitude not between -90 and 90
    or requested_longitude is null or requested_longitude not between -180 and 180
    or (requested_public_email is not null
      and nullif(btrim(requested_public_email), '') is not null
      and requested_public_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Complete geocoded workshop location details are required'
      using errcode = '22023';
  end if;

  select manager.id into manager_id
  from public.workshop_manager_memberships membership
  join public.workshop_manager_profiles manager
    on manager.id = membership.workshop_manager_id
    and manager.status = 'active'
  join public.account_identities identity
    on identity.auth_user_id = manager.auth_user_id
    and identity.status = 'active'
  where membership.service_provider_id = requested_service_provider_id
    and membership.membership_role = 'owner'
    and membership.status = 'active'
    and manager.auth_user_id = (select auth.uid())
  limit 1;
  if manager_id is null then
    raise exception 'Service organisation owner account is unavailable'
      using errcode = '42501';
  end if;

  generated_slug := coalesce(nullif(trim(both '-' from lower(regexp_replace(
    btrim(requested_display_name), '[^a-zA-Z0-9]+', '-', 'g'
  ))), ''), 'workshop') || '-' || left(created_workshop_id::text, 8);

  insert into public.workshops (
    id, service_provider_id, slug, display_name, country_code, status,
    city, address, latitude, longitude, public_phone, public_email,
    creation_source, claim_status
  ) values (
    created_workshop_id, requested_service_provider_id, generated_slug,
    btrim(requested_display_name), normalized_country, 'pending',
    btrim(requested_city), btrim(requested_address),
    requested_latitude, requested_longitude,
    nullif(btrim(requested_public_phone), ''),
    nullif(lower(btrim(requested_public_email)), ''),
    'organisation_owner', 'not_applicable'
  );

  insert into public.workshop_operating_hours (
    workshop_id, weekday, opens_at, closes_at, closed
  )
  select created_workshop_id, day.weekday,
    case when day.weekday between 1 and 5 then time '08:00' end,
    case when day.weekday between 1 and 5 then time '17:00' end,
    day.weekday not between 1 and 5
  from generate_series(0, 6) as day(weekday)
  on conflict (workshop_id, weekday) do nothing;

  insert into public.workshop_manager_assignments (
    workshop_id, workshop_manager_id, assignment_role, status
  ) values (created_workshop_id, manager_id, 'manager', 'active');
  return created_workshop_id;
end;
$$;

create function public.get_admin_workshop_claim_states()
returns table (
  workshop_id uuid,
  creation_source public.workshop_creation_source,
  claim_status public.workshop_claim_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required'
      using errcode = '42501';
  end if;
  return query
  select workshop.id, workshop.creation_source, workshop.claim_status
  from public.workshops workshop;
end;
$$;

revoke all on function public.get_admin_workshop_claim_states()
  from public, anon, authenticated;
grant execute on function public.get_admin_workshop_claim_states()
  to authenticated;

comment on column public.workshops.claim_status is
  'Administrator-created location claim state. Claimed can only be reached after complete organisation billing details and active/trialing Stripe location subscription state.';
comment on function public.begin_my_workshop_claim(uuid) is
  'Starts a claim only for an active owner of the administrator-linked organisation; payment finalization is delegated to the signed Stripe subscription webhook path.';
comment on function private.activate_administrator_workshop() is
  'Administrator-created locations are immediately active; their temporary pre-claim map publication remains separate from Stripe claim completion.';
comment on function private.is_workshop_discoverable(uuid) is
  'Extends map and public detail discovery to active geocoded administrator-curated locations without enabling booking or operational publication.';

commit;
