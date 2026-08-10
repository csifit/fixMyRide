begin;

alter table public.service_provider_invitations
  add column revoked_by_auth_user_id uuid references auth.users(id)
    on delete restrict;

create function private.can_manage_service_organisation(
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
  )
$$;

revoke all on function private.can_manage_service_organisation(uuid)
  from public, anon, authenticated;

create function public.get_my_service_organisation_coverage(
  requested_service_provider_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.can_manage_service_organisation(
    requested_service_provider_id
  ) then
    raise exception 'Service organisation owner access required'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'providerId', provider.id,
    'legalName', provider.legal_name,
    'displayName', provider.display_name,
    'providerStatus', provider.status,
    'unitMonthlyPriceCents', plan.monthly_price_cents,
    'currency', plan.currency,
    'locationCount', (
      select count(*) from public.workshops workshop
      where workshop.service_provider_id = provider.id
    ),
    'coveredLocationCount', (
      select count(*)
      from public.workshops workshop
      join public.workshop_subscriptions subscription
        on subscription.workshop_id = workshop.id
      where workshop.service_provider_id = provider.id
        and (
          subscription.status in ('active', 'trialing')
          or subscription.coverage_grace_ends_at > now()
        )
    ),
    'requiredMonthlyCents', plan.monthly_price_cents * (
      select count(*) from public.workshops workshop
      where workshop.service_provider_id = provider.id
    ),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', workshop.id,
        'displayName', workshop.display_name,
        'status', workshop.status,
        'city', workshop.city,
        'address', workshop.address,
        'subscriptionStatus', subscription.status,
        'coverageGraceEndsAt', subscription.coverage_grace_ends_at,
        'currentPeriodEnd', subscription.current_period_end,
        'coverageState', case
          when subscription.status in ('active', 'trialing') then 'covered'
          when subscription.coverage_grace_ends_at > now() then 'grace'
          when subscription.status in ('incomplete', 'past_due', 'unpaid')
            then 'attention'
          else 'uncovered'
        end,
        'primaryManagerId', primary_manager.id,
        'primaryManagerName', primary_manager.display_name,
        'primaryManagerEmail', primary_manager.email,
        'primaryManagerStatus', primary_manager.assignment_status
      ) order by workshop.display_name)
      from public.workshops workshop
      join public.workshop_subscriptions subscription
        on subscription.workshop_id = workshop.id
      left join lateral (
        select manager.id, manager.display_name, users.email,
          assignment.status as assignment_status
        from public.workshop_manager_assignments assignment
        join public.workshop_manager_profiles manager
          on manager.id = assignment.workshop_manager_id
        join auth.users users on users.id = manager.auth_user_id
        where assignment.workshop_id = workshop.id
          and assignment.assignment_role = 'primary_manager'
          and assignment.status in ('invited', 'active', 'suspended')
        limit 1
      ) primary_manager on true
      where workshop.service_provider_id = provider.id
    ), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', invitation.id,
        'email', invitation.email,
        'status', invitation.status,
        'assignmentRole', invitation.intended_assignment_role,
        'workshopId', workshop.id,
        'workshopName', workshop.display_name,
        'expiresAt', invitation.expires_at,
        'createdAt', invitation.created_at
      ) order by invitation.created_at desc)
      from public.service_provider_invitations invitation
      join public.workshops workshop on workshop.id = invitation.workshop_id
      where invitation.service_provider_id = provider.id
        and invitation.invitation_kind = 'location_manager'
        and invitation.status in ('pending', 'accepted', 'revoked')
    ), '[]'::jsonb)
  ) into result
  from public.service_providers provider
  join public.provider_subscription_plans plan on plan.id = 'standard'
  where provider.id = requested_service_provider_id;

  return result;
end;
$$;

create function public.create_my_location_manager_invitation(
  requested_workshop_id uuid,
  requested_email text,
  requested_assignment_role text,
  requested_token_digest text,
  requested_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  provider_id uuid;
  invitation_id uuid;
  assignment_role public.workshop_manager_assignment_role;
  normalized_email text := lower(btrim(requested_email));
begin
  select workshop.service_provider_id into provider_id
  from public.workshops workshop
  where workshop.id = requested_workshop_id;

  if provider_id is null
    or not private.can_manage_service_organisation(provider_id) then
    raise exception 'Service organisation owner access required'
      using errcode = '42501';
  end if;
  if requested_assignment_role not in ('primary_manager', 'manager')
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or requested_token_digest !~ '^[a-f0-9]{64}$'
    or requested_expires_at <= now()
    or requested_expires_at > now() + interval '30 days' then
    raise exception 'Valid location manager invitation details are required'
      using errcode = '22023';
  end if;
  assignment_role := requested_assignment_role::public.workshop_manager_assignment_role;

  if exists (
    select 1 from auth.users users where lower(users.email) = normalized_email
  ) or exists (
    select 1 from public.service_provider_invitations invitation
    where invitation.email = normalized_email
      and invitation.status = 'pending'
  ) then
    raise exception 'An account or pending invitation already uses this email'
      using errcode = '23505';
  end if;
  if assignment_role = 'primary_manager' and (
    exists (
      select 1 from public.workshop_manager_assignments assignment
      where assignment.workshop_id = requested_workshop_id
        and assignment.assignment_role = 'primary_manager'
        and assignment.status in ('invited', 'active', 'suspended')
    ) or exists (
      select 1 from public.service_provider_invitations invitation
      where invitation.workshop_id = requested_workshop_id
        and invitation.invitation_kind = 'location_manager'
        and invitation.intended_assignment_role = 'primary_manager'
        and invitation.status = 'pending'
        and invitation.expires_at > now()
    )
  ) then
    raise exception 'Workshop already has a live primary manager'
      using errcode = '23505';
  end if;

  insert into public.service_provider_invitations (
    service_provider_id, workshop_id, invitation_kind,
    intended_membership_role, intended_assignment_role, email, token_digest,
    invited_by_auth_user_id, expires_at
  ) values (
    provider_id, requested_workshop_id, 'location_manager', 'manager',
    assignment_role, normalized_email, requested_token_digest,
    (select auth.uid()), requested_expires_at
  ) returning id into invitation_id;

  return invitation_id;
end;
$$;

create function public.revoke_my_location_manager_invitation(
  requested_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  provider_id uuid;
begin
  select invitation.service_provider_id into provider_id
  from public.service_provider_invitations invitation
  where invitation.id = requested_invitation_id
    and invitation.invitation_kind = 'location_manager'
    and invitation.status = 'pending'
  for update;

  if provider_id is null then
    raise exception 'Pending location manager invitation not found'
      using errcode = 'P0002';
  end if;
  if not private.can_manage_service_organisation(provider_id) then
    raise exception 'Service organisation owner access required'
      using errcode = '42501';
  end if;

  update public.service_provider_invitations
  set status = 'revoked', revoked_at = now(),
    revoked_by_auth_user_id = (select auth.uid())
  where id = requested_invitation_id;
end;
$$;

revoke all on function public.get_my_service_organisation_coverage(uuid)
  from public, anon, authenticated;
revoke all on function public.create_my_location_manager_invitation(
  uuid, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.revoke_my_location_manager_invitation(uuid)
  from public, anon, authenticated;

grant execute on function public.get_my_service_organisation_coverage(uuid)
  to authenticated;
grant execute on function public.create_my_location_manager_invitation(
  uuid, text, text, text, timestamptz
) to authenticated;
grant execute on function public.revoke_my_location_manager_invitation(uuid)
  to authenticated;

comment on function public.get_my_service_organisation_coverage(uuid) is
  'Owner-scoped location coverage, manager responsibility, invitation state, and EUR 35-per-location cost projection.';
comment on function public.create_my_location_manager_invitation(
  uuid, text, text, text, timestamptz
) is 'Creates a hashed seven-day manager invitation for a location owned by the signed-in organisation owner.';

commit;
