begin;

-- Administrator-issued organisation invitations may reserve one curated
-- workshop and grant that location one non-renewable promotional trial. The
-- invitation remains distinct from Stripe: ownership is permanent, while
-- promotional billing coverage expires at the recorded timestamp.
alter table public.service_provider_invitations
  add column claim_workshop_id uuid
    references public.workshops(id) on delete restrict,
  add column promotional_trial_days smallint;

alter table public.service_provider_invitations
  add constraint service_provider_invitation_promotional_trial check (
    (
      invitation_kind = 'organisation_owner'
      and (
        (claim_workshop_id is null and promotional_trial_days is null)
        or
        (claim_workshop_id is not null and promotional_trial_days in (60, 90))
      )
    )
    or
    (
      invitation_kind = 'location_manager'
      and claim_workshop_id is null
      and promotional_trial_days is null
    )
  );

create unique index service_provider_one_pending_claim_invitation_idx
  on public.service_provider_invitations(claim_workshop_id)
  where status = 'pending' and claim_workshop_id is not null;

alter table public.workshop_subscriptions
  add column promotional_trial_started_at timestamptz,
  add column promotional_trial_ends_at timestamptz,
  add column promotional_trial_invitation_id uuid unique
    references public.service_provider_invitations(id) on delete restrict,
  add constraint workshop_subscription_promotional_trial_dates check (
    (
      promotional_trial_started_at is null
      and promotional_trial_ends_at is null
      and promotional_trial_invitation_id is null
    )
    or
    (
      promotional_trial_started_at is not null
      and promotional_trial_ends_at > promotional_trial_started_at
      and promotional_trial_invitation_id is not null
    )
  );

create function private.preserve_promotional_trial_billable_from()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.coverage_started_at is null
    and new.coverage_started_at is not null
    and old.promotional_trial_ends_at is not null then
    new.billable_from := old.promotional_trial_ends_at::date;
  end if;
  return new;
end;
$$;

revoke all on function private.preserve_promotional_trial_billable_from()
  from public, anon, authenticated;
create trigger workshop_subscriptions_preserve_trial_billable_from
before update of coverage_started_at, billable_from
on public.workshop_subscriptions
for each row execute function private.preserve_promotional_trial_billable_from();

alter table public.platform_organisation_admin_history
  drop constraint platform_organisation_admin_history_action_check;
alter table public.platform_organisation_admin_history
  add constraint platform_organisation_admin_history_action_check check (action in (
    'organisation_invited', 'organisation_invitation_resent',
    'organisation_updated', 'organisation_status_changed',
    'organisation_deleted', 'location_created', 'location_updated',
    'location_coverage_assigned', 'manager_invited', 'manager_assigned',
    'account_status_changed', 'workshop_claimed_with_trial'
  ));

drop function public.create_admin_service_organisation_invitation(
  text, text, text, text, text, timestamptz
);

create function public.create_admin_service_organisation_invitation(
  requested_legal_name text,
  requested_display_name text,
  requested_country_code text,
  requested_email text,
  requested_token_digest text,
  requested_expires_at timestamptz,
  requested_workshop_id uuid,
  requested_trial_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  provider_id uuid;
  invitation_id uuid;
  workshop_name text;
  normalized_email text := lower(btrim(requested_email));
  normalized_country text := upper(btrim(requested_country_code));
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(requested_legal_name, ''))) not between 2 and 200
    or char_length(btrim(coalesce(requested_display_name, ''))) not between 2 and 160
    or normalized_country !~ '^[A-Z]{2}$'
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or requested_token_digest !~ '^[a-f0-9]{64}$'
    or requested_expires_at <= now()
    or requested_expires_at > now() + interval '30 days'
    or requested_workshop_id is null
    or requested_trial_days not in (60, 90) then
    raise exception 'Valid organisation invitation details are required' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users users where lower(users.email) = normalized_email)
    or exists (
      select 1 from public.service_provider_invitations invitation
      where invitation.email = normalized_email and invitation.status = 'pending'
    ) then
    raise exception 'An account or pending invitation already uses this email' using errcode = '23505';
  end if;

  select workshop.display_name into workshop_name
  from public.workshops workshop
  join public.workshop_subscriptions subscription
    on subscription.workshop_id = workshop.id
  where workshop.id = requested_workshop_id
    and workshop.creation_source = 'administrator'
    and workshop.claim_status = 'unclaimed'
    and workshop.service_provider_id is null
    and subscription.promotional_trial_started_at is null
  for update of workshop, subscription;
  if workshop_name is null then
    raise exception 'An unclaimed administrator workshop is required' using errcode = '23503';
  end if;

  actor_id := private.current_platform_administrator_id();
  insert into public.service_providers (
    legal_name, display_name, country_code, status
  ) values (
    btrim(requested_legal_name), btrim(requested_display_name),
    normalized_country, 'pending'
  ) returning id into provider_id;

  insert into public.service_provider_invitations (
    service_provider_id, invitation_kind, intended_membership_role,
    intended_assignment_role, email, token_digest, invited_by_auth_user_id,
    expires_at, claim_workshop_id, promotional_trial_days
  ) values (
    provider_id, 'organisation_owner', 'owner', null, normalized_email,
    requested_token_digest, (select auth.uid()), requested_expires_at,
    requested_workshop_id, requested_trial_days
  ) returning id into invitation_id;

  insert into public.platform_organisation_admin_history (
    action, service_provider_id, workshop_id, invitation_id,
    actor_administrator_id, details
  ) values (
    'organisation_invited', provider_id, requested_workshop_id, invitation_id,
    actor_id, jsonb_build_object('promotionalTrialDays', requested_trial_days)
  );

  return jsonb_build_object(
    'serviceProviderId', provider_id,
    'invitationId', invitation_id,
    'workshopName', workshop_name,
    'promotionalTrialDays', requested_trial_days
  );
end;
$$;

revoke all on function public.create_admin_service_organisation_invitation(
  text, text, text, text, text, timestamptz, uuid, integer
) from public, anon, authenticated;
grant execute on function public.create_admin_service_organisation_invitation(
  text, text, text, text, text, timestamptz, uuid, integer
) to authenticated;

create or replace function private.handle_service_provider_invitation_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.service_provider_invitations%rowtype;
  manager_id uuid;
  workshop_row public.workshops%rowtype;
  actor_id uuid;
  accepted_timestamp timestamptz := now();
  normalized_name text := nullif(btrim(new.raw_user_meta_data->>'full_name'), '');
  requested_invitation_id uuid;
  requested_digest text;
begin
  if nullif(new.raw_user_meta_data->>'service_provider_invitation_id', '') is null
    then return new;
  end if;
  requested_invitation_id :=
    (new.raw_user_meta_data->>'service_provider_invitation_id')::uuid;
  requested_digest := new.raw_user_meta_data->>'service_provider_invitation_digest';
  if normalized_name is null or char_length(normalized_name) > 160 then
    raise exception 'A valid invited manager name is required' using errcode = '23514';
  end if;

  select candidate.* into invitation
  from public.service_provider_invitations candidate
  where candidate.id = requested_invitation_id
    and candidate.token_digest = requested_digest
    and candidate.email = lower(new.email)
    and candidate.status = 'pending'
    and candidate.expires_at > accepted_timestamp
  for update;
  if invitation.id is null then
    raise exception 'Invitation is invalid or expired' using errcode = '23514';
  end if;

  if invitation.claim_workshop_id is not null then
    select workshop.* into workshop_row
    from public.workshops workshop
    where workshop.id = invitation.claim_workshop_id
      and workshop.creation_source = 'administrator'
      and workshop.claim_status = 'unclaimed'
      and workshop.service_provider_id is null
    for update;
    if workshop_row.id is null or exists (
      select 1 from public.workshop_subscriptions subscription
      where subscription.workshop_id = invitation.claim_workshop_id
        and subscription.promotional_trial_started_at is not null
    ) then
      raise exception 'The invited workshop is no longer claimable' using errcode = '23514';
    end if;
    update public.workshops
    set service_provider_id = invitation.service_provider_id
    where id = workshop_row.id;
  end if;

  insert into public.workshop_manager_profiles (
    auth_user_id, display_name, status
  ) values (new.id, normalized_name, 'active')
  returning id into manager_id;
  insert into public.workshop_manager_memberships (
    service_provider_id, workshop_manager_id, membership_role, status
  ) values (
    invitation.service_provider_id, manager_id,
    invitation.intended_membership_role, 'active'
  );

  if invitation.invitation_kind = 'location_manager' then
    insert into public.workshop_manager_assignments (
      workshop_id, workshop_manager_id, assignment_role, status, invitation_id
    ) values (
      invitation.workshop_id, manager_id,
      invitation.intended_assignment_role, 'active', invitation.id
    );
  elsif invitation.claim_workshop_id is not null then
    insert into public.workshop_manager_assignments (
      workshop_id, workshop_manager_id, assignment_role, status
    ) values (
      invitation.claim_workshop_id, manager_id, 'primary_manager', 'active'
    );

    update public.workshop_subscriptions
    set promotional_trial_started_at = accepted_timestamp,
      promotional_trial_ends_at = accepted_timestamp
        + make_interval(days => invitation.promotional_trial_days),
      promotional_trial_invitation_id = invitation.id
    where workshop_id = invitation.claim_workshop_id
      and promotional_trial_started_at is null;
    if not found then
      raise exception 'The workshop promotional trial is unavailable' using errcode = '23514';
    end if;

    update public.workshops
    set claim_status = 'claimed',
      claim_requested_by_workshop_manager_id = manager_id,
      claim_requested_at = accepted_timestamp,
      claimed_at = accepted_timestamp
    where id = invitation.claim_workshop_id;

    select administrator.id into actor_id
    from public.application_administrators administrator
    where administrator.auth_user_id = invitation.invited_by_auth_user_id;
    insert into public.platform_organisation_admin_history (
      action, service_provider_id, workshop_id, workshop_manager_id,
      invitation_id, actor_administrator_id, details
    ) values (
      'workshop_claimed_with_trial', invitation.service_provider_id,
      invitation.claim_workshop_id, manager_id, invitation.id, actor_id,
      jsonb_build_object(
        'promotionalTrialDays', invitation.promotional_trial_days,
        'promotionalTrialStartedAt', accepted_timestamp,
        'promotionalTrialEndsAt', accepted_timestamp
          + make_interval(days => invitation.promotional_trial_days)
      )
    );
  end if;

  insert into public.account_identities (
    auth_user_id, account_type, target_account_type, status
  ) values (new.id, 'clinic_manager', 'workshop_manager', 'active');
  update public.service_provider_invitations
  set status = 'accepted', accepted_at = accepted_timestamp,
    accepted_by_auth_user_id = new.id
  where id = invitation.id;
  return new;
end;
$$;

revoke all on function private.handle_service_provider_invitation_registration()
  from public, anon, authenticated;

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
        location_billing.promotional_trial_ends_at > now()
        or location_billing.coverage_grace_ends_at > now()
        or (
          location_billing.status in ('active', 'trialing')
          and (
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

create function public.get_my_provider_promotional_trials(
  requested_provider_id uuid
)
returns table (
  workshop_id uuid,
  promotional_trial_started_at timestamptz,
  promotional_trial_ends_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_service_organisation(requested_provider_id) then
    raise exception 'Service organisation owner access required' using errcode = '42501';
  end if;
  return query
  select workshop.id, subscription.promotional_trial_started_at,
    subscription.promotional_trial_ends_at
  from public.workshops workshop
  join public.workshop_subscriptions subscription
    on subscription.workshop_id = workshop.id
  where workshop.service_provider_id = requested_provider_id
    and subscription.promotional_trial_started_at is not null;
end;
$$;

revoke all on function public.get_my_provider_promotional_trials(uuid)
  from public, anon, authenticated;
grant execute on function public.get_my_provider_promotional_trials(uuid)
  to authenticated;

create function public.get_admin_promotional_trial_invitations()
returns table (
  invitation_id uuid,
  workshop_id uuid,
  workshop_name text,
  promotional_trial_days smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required' using errcode = '42501';
  end if;
  return query
  select invitation.id, workshop.id, workshop.display_name,
    invitation.promotional_trial_days
  from public.service_provider_invitations invitation
  join public.workshops workshop on workshop.id = invitation.claim_workshop_id
  where invitation.invitation_kind = 'organisation_owner';
end;
$$;

revoke all on function public.get_admin_promotional_trial_invitations()
  from public, anon, authenticated;
grant execute on function public.get_admin_promotional_trial_invitations()
  to authenticated;

comment on column public.service_provider_invitations.claim_workshop_id is
  'Administrator-curated workshop reserved for claim when an organisation-owner invitation is accepted.';
comment on column public.workshop_subscriptions.promotional_trial_ends_at is
  'Non-renewable platform-granted access deadline; it is independent of Stripe subscription state and does not undo workshop ownership when it expires.';

commit;
