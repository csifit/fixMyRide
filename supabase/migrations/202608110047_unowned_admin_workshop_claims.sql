begin;

-- Platform-curated listings can exist before a service organisation claims
-- them. All operational authorization continues to require a non-null owner.
alter table public.workshops
  alter column service_provider_id drop not null;

drop function public.get_public_workshop_claim(uuid);
create function public.get_public_workshop_claim(
  requested_workshop_id uuid
)
returns table (
  workshop_id uuid,
  service_provider_id uuid,
  display_name text,
  city text,
  practice_address text,
  country_code char(2),
  service_provider_name text,
  claim_status public.workshop_claim_status
)
language sql stable security definer set search_path = ''
as $$
  select workshop.id, workshop.service_provider_id,
    workshop.display_name, workshop.city, workshop.address,
    workshop.country_code, provider.display_name, workshop.claim_status
  from public.workshops workshop
  left join public.service_providers provider
    on provider.id = workshop.service_provider_id
  where workshop.id = requested_workshop_id
    and workshop.creation_source = 'administrator'
    and workshop.status in ('pending', 'active')
    and (provider.id is null or provider.status in ('pending', 'active'))
$$;

revoke all on function public.get_public_workshop_claim(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_workshop_claim(uuid)
  to anon, authenticated;

drop function public.begin_my_workshop_claim(uuid);
create function public.begin_my_workshop_claim(
  requested_workshop_id uuid,
  requested_service_provider_id uuid
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
  provider_id uuid;
begin
  select workshop.* into workshop_row
  from public.workshops workshop
  where workshop.id = requested_workshop_id
    and workshop.creation_source = 'administrator'
    and workshop.claim_status in ('unclaimed', 'awaiting_payment')
  for update;

  provider_id := coalesce(
    workshop_row.service_provider_id,
    requested_service_provider_id
  );
  if workshop_row.id is null or provider_id is null
    or (workshop_row.service_provider_id is not null
      and requested_service_provider_id is not null
      and workshop_row.service_provider_id <> requested_service_provider_id)
    or not private.can_manage_service_organisation(provider_id) then
    raise exception 'An active owner of the selected service organisation is required'
      using errcode = '42501';
  end if;

  if workshop_row.service_provider_id is null then
    update public.workshops
    set service_provider_id = provider_id
    where id = workshop_row.id and service_provider_id is null;
    workshop_row.service_provider_id := provider_id;
  end if;

  select manager.id into manager_id
  from public.workshop_manager_memberships membership
  join public.workshop_manager_profiles manager
    on manager.id = membership.workshop_manager_id
    and manager.status = 'active'
  join public.account_identities identity
    on identity.auth_user_id = manager.auth_user_id
    and identity.status = 'active'
  where membership.service_provider_id = provider_id
    and membership.membership_role = 'owner'
    and membership.status = 'active'
    and manager.auth_user_id = (select auth.uid())
  limit 1;

  details_complete := private.has_complete_service_provider_claim_details(
    provider_id
  );
  if not details_complete then
    return jsonb_build_object(
      'providerId', provider_id,
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
    'providerId', provider_id,
    'state', case when coalesce(paid, false)
      then 'claimed' else 'payment_required' end
  );
end;
$$;

revoke all on function public.begin_my_workshop_claim(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_my_workshop_claim(uuid, uuid)
  to authenticated;

create or replace function private.is_workshop_discoverable(
  requested_workshop_id uuid
)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_workshop_publication_eligible(requested_workshop_id)
    or exists (
      select 1
      from public.workshops workshop
      left join public.service_providers provider
        on provider.id = workshop.service_provider_id
      where workshop.id = requested_workshop_id
        and workshop.status = 'active'
        and workshop.creation_source = 'administrator'
        and workshop.claim_status in ('unclaimed', 'awaiting_payment')
        and (provider.id is null or provider.status in ('pending', 'active'))
        and nullif(btrim(workshop.display_name), '') is not null
        and nullif(btrim(workshop.city), '') is not null
        and nullif(btrim(workshop.address), '') is not null
        and workshop.latitude between -90 and 90
        and workshop.longitude between -180 and 180
    )
$$;

revoke all on function private.is_workshop_discoverable(uuid)
  from public, anon, authenticated;

create or replace function public.create_admin_workshop_location(
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
  actor_id uuid;
  created_workshop_id uuid := gen_random_uuid();
  normalized_country text := upper(btrim(requested_country_code));
  generated_slug text;
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required'
      using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(requested_display_name, ''))) not between 2 and 160
    or normalized_country !~ '^[A-Z]{2}$'
    or nullif(btrim(coalesce(requested_city, '')), '') is null
    or nullif(btrim(coalesce(requested_address, '')), '') is null
    or requested_latitude is null or requested_latitude not between -90 and 90
    or requested_longitude is null or requested_longitude not between -180 and 180
    or (requested_service_provider_id is not null and not exists (
      select 1 from public.service_providers provider
      where provider.id = requested_service_provider_id
        and provider.status in ('pending', 'active')
    )) then
    raise exception 'Valid geocoded workshop location details are required'
      using errcode = '22023';
  end if;

  generated_slug := coalesce(nullif(trim(both '-' from lower(regexp_replace(
    btrim(requested_display_name), '[^a-zA-Z0-9]+', '-', 'g'
  ))), ''), 'workshop') || '-' || left(created_workshop_id::text, 8);
  actor_id := private.current_platform_administrator_id();

  insert into public.workshops (
    id, service_provider_id, slug, display_name, country_code, status,
    active_from, city, address, latitude, longitude, public_phone,
    public_email, creation_source, claim_status
  ) values (
    created_workshop_id, requested_service_provider_id, generated_slug,
    btrim(requested_display_name), normalized_country, 'active', current_date,
    btrim(requested_city), btrim(requested_address),
    requested_latitude, requested_longitude,
    nullif(btrim(requested_public_phone), ''),
    nullif(lower(btrim(requested_public_email)), ''),
    'administrator', 'unclaimed'
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

  insert into public.platform_organisation_admin_history (
    action, service_provider_id, workshop_id, actor_administrator_id,
    details
  ) values (
    'location_created', requested_service_provider_id,
    created_workshop_id, actor_id,
    jsonb_build_object('ownershipAssigned',
      requested_service_provider_id is not null)
  );
  return created_workshop_id;
end;
$$;

revoke all on function public.create_admin_workshop_location(
  uuid, text, text, text, text, numeric, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.create_admin_workshop_location(
  uuid, text, text, text, text, numeric, numeric, text, text
) to authenticated;

create function public.get_admin_unowned_workshops()
returns table (
  workshop_id uuid, display_name text, status public.organization_status,
  city text, practice_address text, country_code char(2),
  subscription_status public.provider_subscription_status
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required'
      using errcode = '42501';
  end if;
  return query
  select workshop.id, workshop.display_name, workshop.status,
    workshop.city, workshop.address, workshop.country_code,
    subscription.status
  from public.workshops workshop
  left join public.workshop_subscriptions subscription
    on subscription.workshop_id = workshop.id
  where workshop.service_provider_id is null
    and workshop.creation_source = 'administrator';
end;
$$;

revoke all on function public.get_admin_unowned_workshops()
  from public, anon, authenticated;
grant execute on function public.get_admin_unowned_workshops()
  to authenticated;

comment on column public.workshops.service_provider_id is
  'Owning service organisation; null only for an unclaimed administrator-curated listing.';
comment on function public.begin_my_workshop_claim(uuid, uuid) is
  'Attaches an unowned admin listing to an active owner organisation before enforcing complete billing details and paid location subscription claim finalization.';

commit;
