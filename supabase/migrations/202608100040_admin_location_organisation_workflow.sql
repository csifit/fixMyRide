begin;

alter table public.service_provider_invitations
  add column intended_assignment_role
    public.workshop_manager_assignment_role;

alter table public.service_provider_invitations
  add constraint service_provider_invitation_assignment_role check (
    (invitation_kind = 'organisation_owner'
      and intended_assignment_role is null)
    or
    (invitation_kind = 'location_manager'
      and intended_assignment_role is not null)
  );

create table public.platform_organisation_admin_history (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in (
    'organisation_invited', 'location_created', 'manager_invited',
    'manager_assigned', 'account_status_changed'
  )),
  service_provider_id uuid references public.service_providers(id)
    on delete restrict,
  workshop_id uuid references public.workshops(id) on delete restrict,
  workshop_manager_id uuid references public.workshop_manager_profiles(id)
    on delete restrict,
  invitation_id uuid references public.service_provider_invitations(id)
    on delete restrict,
  target_auth_user_id uuid references auth.users(id) on delete restrict,
  actor_administrator_id uuid not null
    references public.application_administrators(id) on delete restrict,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(details) = 'object')
);

create index platform_organisation_admin_history_created_idx
  on public.platform_organisation_admin_history(created_at desc);

create trigger platform_organisation_admin_history_immutable
before update or delete on public.platform_organisation_admin_history
for each row execute function private.prevent_location_organisation_history_mutation();

alter table public.platform_organisation_admin_history enable row level security;
revoke all on table public.platform_organisation_admin_history
  from public, anon, authenticated;

create or replace function private.is_active_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.jwt()->>'aal') = 'aal2'
    and exists (
      select 1
      from public.application_administrators administrator
      join public.account_identities identity
        on identity.auth_user_id = administrator.auth_user_id
        and identity.status = 'active'
      where administrator.auth_user_id = (select auth.uid())
        and administrator.role::text in ('superadmin', 'admin')
        and administrator.status = 'active'
    )
$$;

-- Account status is enforced at the shared workshop authorization boundary so
-- blocked or deactivated managers cannot bypass the application with direct RPCs.
create or replace function private.can_manage_automotive_workshop(
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
    join public.workshop_manager_memberships membership
      on membership.service_provider_id = workshop.service_provider_id
      and membership.status = 'active'
      and membership.membership_role in ('owner', 'manager')
    join public.workshop_manager_profiles manager
      on manager.id = membership.workshop_manager_id
      and manager.status = 'active'
    join public.account_identities identity
      on identity.auth_user_id = manager.auth_user_id
      and identity.status = 'active'
    where workshop.id = requested_workshop_id
      and manager.auth_user_id = (select auth.uid())
  )
$$;

create or replace function private.current_platform_administrator_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select administrator.id
  from public.application_administrators administrator
  join public.account_identities identity
    on identity.auth_user_id = administrator.auth_user_id
    and identity.status = 'active'
  where administrator.auth_user_id = (select auth.uid())
    and administrator.status = 'active'
    and administrator.role::text in ('superadmin', 'admin')
$$;

revoke all on function private.current_platform_administrator_id()
  from public, anon, authenticated;

create function public.create_admin_service_organisation_invitation(
  requested_legal_name text,
  requested_display_name text,
  requested_country_code text,
  requested_email text,
  requested_token_digest text,
  requested_expires_at timestamptz
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
    or requested_expires_at > now() + interval '30 days' then
    raise exception 'Valid organisation invitation details are required' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users users where lower(users.email) = normalized_email)
    or exists (
      select 1 from public.service_provider_invitations invitation
      where invitation.email = normalized_email and invitation.status = 'pending'
    ) then
    raise exception 'An account or pending invitation already uses this email' using errcode = '23505';
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
    expires_at
  ) values (
    provider_id, 'organisation_owner', 'owner', null, normalized_email,
    requested_token_digest, (select auth.uid()), requested_expires_at
  ) returning id into invitation_id;

  insert into public.platform_organisation_admin_history (
    action, service_provider_id, invitation_id, actor_administrator_id
  ) values ('organisation_invited', provider_id, invitation_id, actor_id);

  return jsonb_build_object(
    'serviceProviderId', provider_id, 'invitationId', invitation_id
  );
end;
$$;

create function public.create_admin_workshop_location(
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
  workshop_id uuid := gen_random_uuid();
  normalized_country text := upper(btrim(requested_country_code));
  generated_slug text;
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(requested_display_name, ''))) not between 2 and 160
    or normalized_country !~ '^[A-Z]{2}$'
    or ((requested_latitude is null) <> (requested_longitude is null))
    or (requested_latitude is not null and requested_latitude not between -90 and 90)
    or (requested_longitude is not null and requested_longitude not between -180 and 180)
    or not exists (
      select 1 from public.service_providers provider
      where provider.id = requested_service_provider_id
        and provider.status in ('pending', 'active')
    ) then
    raise exception 'Valid workshop location details are required' using errcode = '22023';
  end if;

  generated_slug := coalesce(nullif(trim(both '-' from lower(regexp_replace(
    btrim(requested_display_name), '[^a-zA-Z0-9]+', '-', 'g'
  ))), ''), 'workshop') || '-' || left(workshop_id::text, 8);
  actor_id := private.current_platform_administrator_id();

  insert into public.workshops (
    id, service_provider_id, slug, display_name, country_code, status,
    city, address, latitude, longitude, public_phone, public_email
  ) values (
    workshop_id, requested_service_provider_id, generated_slug,
    btrim(requested_display_name), normalized_country, 'pending',
    nullif(btrim(requested_city), ''), nullif(btrim(requested_address), ''),
    requested_latitude, requested_longitude,
    nullif(btrim(requested_public_phone), ''),
    nullif(lower(btrim(requested_public_email)), '')
  );

  insert into public.workshop_operating_hours (
    workshop_id, weekday, opens_at, closes_at, closed
  )
  select workshop_id, day.weekday,
    case when day.weekday between 1 and 5 then time '08:00' end,
    case when day.weekday between 1 and 5 then time '17:00' end,
    day.weekday not between 1 and 5
  from generate_series(0, 6) as day(weekday)
  on conflict (workshop_id, weekday) do nothing;

  insert into public.platform_organisation_admin_history (
    action, service_provider_id, workshop_id, actor_administrator_id
  ) values (
    'location_created', requested_service_provider_id, workshop_id, actor_id
  );
  return workshop_id;
end;
$$;

create function public.create_admin_location_manager_invitation(
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
  actor_id uuid;
  provider_id uuid;
  invitation_id uuid;
  assignment_role public.workshop_manager_assignment_role;
  normalized_email text := lower(btrim(requested_email));
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required' using errcode = '42501';
  end if;
  if requested_assignment_role not in ('primary_manager', 'manager')
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or requested_token_digest !~ '^[a-f0-9]{64}$'
    or requested_expires_at <= now()
    or requested_expires_at > now() + interval '30 days' then
    raise exception 'Valid location manager invitation details are required' using errcode = '22023';
  end if;
  assignment_role := requested_assignment_role::public.workshop_manager_assignment_role;
  select workshop.service_provider_id into provider_id
  from public.workshops workshop where workshop.id = requested_workshop_id;
  if provider_id is null then
    raise exception 'Workshop location not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from auth.users users where lower(users.email) = normalized_email)
    or exists (
      select 1 from public.service_provider_invitations invitation
      where invitation.email = normalized_email and invitation.status = 'pending'
    ) then
    raise exception 'Assign the existing manager or revoke the pending invitation' using errcode = '23505';
  end if;
  if assignment_role = 'primary_manager' and exists (
    select 1 from public.workshop_manager_assignments assignment
    where assignment.workshop_id = requested_workshop_id
      and assignment.assignment_role = 'primary_manager'
      and assignment.status in ('invited', 'active', 'suspended')
  ) then
    raise exception 'Workshop already has a live primary manager' using errcode = '23505';
  end if;

  actor_id := private.current_platform_administrator_id();
  insert into public.service_provider_invitations (
    service_provider_id, workshop_id, invitation_kind,
    intended_membership_role, intended_assignment_role, email, token_digest,
    invited_by_auth_user_id, expires_at
  ) values (
    provider_id, requested_workshop_id, 'location_manager', 'manager',
    assignment_role, normalized_email, requested_token_digest,
    (select auth.uid()), requested_expires_at
  ) returning id into invitation_id;

  insert into public.platform_organisation_admin_history (
    action, service_provider_id, workshop_id, invitation_id,
    actor_administrator_id
  ) values (
    'manager_invited', provider_id, requested_workshop_id, invitation_id,
    actor_id
  );
  return invitation_id;
end;
$$;

create function public.assign_admin_workshop_manager(
  requested_workshop_id uuid,
  requested_workshop_manager_id uuid,
  requested_assignment_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  provider_id uuid;
  membership_id uuid;
  assignment_id uuid;
  new_assignment_role public.workshop_manager_assignment_role;
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required' using errcode = '42501';
  end if;
  if requested_assignment_role not in ('primary_manager', 'manager') then
    raise exception 'Valid assignment role required' using errcode = '22023';
  end if;
  new_assignment_role := requested_assignment_role::public.workshop_manager_assignment_role;
  select workshop.service_provider_id into provider_id
  from public.workshops workshop where workshop.id = requested_workshop_id;
  if provider_id is null or not exists (
    select 1 from public.workshop_manager_profiles manager
    join public.account_identities identity
      on identity.auth_user_id = manager.auth_user_id and identity.status = 'active'
    where manager.id = requested_workshop_manager_id
      and manager.status = 'active'
  ) then
    raise exception 'Active workshop and manager required' using errcode = '22023';
  end if;

  select membership.id into membership_id
  from public.workshop_manager_memberships membership
  where membership.service_provider_id = provider_id
    and membership.workshop_manager_id = requested_workshop_manager_id
    and membership.status in ('invited', 'active', 'suspended')
  order by membership.created_at desc limit 1 for update;
  if membership_id is null then
    insert into public.workshop_manager_memberships (
      service_provider_id, workshop_manager_id, membership_role, status
    ) values (provider_id, requested_workshop_manager_id, 'manager', 'active')
    returning id into membership_id;
  else
    update public.workshop_manager_memberships set status = 'active', ends_before = null
    where id = membership_id;
  end if;

  if new_assignment_role = 'primary_manager' then
    update public.workshop_manager_assignments assignment
    set status = 'ended',
      ends_before = greatest(current_date + 1, assignment.starts_on + 1)
    where assignment.workshop_id = requested_workshop_id
      and assignment.assignment_role = 'primary_manager'
      and assignment.status in ('invited', 'active', 'suspended')
      and assignment.workshop_manager_id <> requested_workshop_manager_id;
  end if;

  select assignment.id into assignment_id
  from public.workshop_manager_assignments assignment
  where assignment.workshop_id = requested_workshop_id
    and assignment.workshop_manager_id = requested_workshop_manager_id
    and assignment.status in ('invited', 'active', 'suspended')
  limit 1 for update;
  if assignment_id is null then
    insert into public.workshop_manager_assignments (
      workshop_id, workshop_manager_id, assignment_role, status
    ) values (
      requested_workshop_id, requested_workshop_manager_id,
      new_assignment_role, 'active'
    );
  else
    update public.workshop_manager_assignments
    set assignment_role = new_assignment_role, status = 'active', ends_before = null
    where id = assignment_id;
  end if;

  actor_id := private.current_platform_administrator_id();
  insert into public.platform_organisation_admin_history (
    action, service_provider_id, workshop_id, workshop_manager_id,
    actor_administrator_id, details
  ) values (
    'manager_assigned', provider_id, requested_workshop_id,
    requested_workshop_manager_id, actor_id,
    jsonb_build_object('assignmentRole', new_assignment_role)
  );
end;
$$;

create function public.set_admin_platform_account_status(
  requested_auth_user_id uuid,
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
  actor_role text;
  target_admin_role text;
  previous_status public.platform_account_status;
  new_status public.platform_account_status;
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required' using errcode = '42501';
  end if;
  if requested_status not in ('active', 'deactivated', 'blocked')
    or char_length(btrim(coalesce(requested_reason, ''))) not between 2 and 500 then
    raise exception 'Valid account status and reason required' using errcode = '22023';
  end if;
  if requested_auth_user_id = (select auth.uid()) then
    raise exception 'Administrators cannot change their own account status' using errcode = '42501';
  end if;
  new_status := requested_status::public.platform_account_status;
  select administrator.id, administrator.role::text
    into actor_id, actor_role
  from public.application_administrators administrator
  where administrator.auth_user_id = (select auth.uid())
    and administrator.status = 'active';
  select administrator.role::text into target_admin_role
  from public.application_administrators administrator
  where administrator.auth_user_id = requested_auth_user_id;
  if target_admin_role is not null and actor_role <> 'superadmin' then
    raise exception 'Only Superadmins can manage administrator accounts' using errcode = '42501';
  end if;

  select identity.status into previous_status
  from public.account_identities identity
  where identity.auth_user_id = requested_auth_user_id for update;
  if previous_status is null then
    raise exception 'Platform account not found' using errcode = 'P0002';
  end if;
  if previous_status = new_status then
    raise exception 'Account status is unchanged' using errcode = '22023';
  end if;
  if target_admin_role = 'superadmin' and new_status <> 'active' and (
    select count(*)
    from public.application_administrators administrator
    join public.account_identities identity
      on identity.auth_user_id = administrator.auth_user_id
      and identity.status = 'active'
    where administrator.role::text = 'superadmin'
      and administrator.status = 'active'
  ) <= 1 then
    raise exception 'The last active Superadmin cannot be disabled' using errcode = '23514';
  end if;

  update public.account_identities
  set status = new_status, status_changed_at = now()
  where auth_user_id = requested_auth_user_id;
  insert into public.platform_account_status_history (
    auth_user_id, previous_status, new_status, reason, changed_by_auth_user_id
  ) values (
    requested_auth_user_id, previous_status, new_status,
    btrim(requested_reason), (select auth.uid())
  );
  insert into public.platform_organisation_admin_history (
    action, target_auth_user_id, actor_administrator_id, details
  ) values (
    'account_status_changed', requested_auth_user_id, actor_id,
    jsonb_build_object('previousStatus', previous_status,
      'newStatus', new_status, 'reason', btrim(requested_reason))
  );
end;
$$;

create function public.get_admin_organisation_workflow()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'workshops', coalesce((select jsonb_agg(jsonb_build_object(
      'id', workshop.id, 'providerId', workshop.service_provider_id,
      'displayName', workshop.display_name, 'status', workshop.status,
      'city', workshop.city, 'address', workshop.address,
      'countryCode', workshop.country_code,
      'primaryManagerId', primary_assignment.workshop_manager_id,
      'primaryManagerName', primary_assignment.display_name,
      'subscriptionStatus', subscription.status
    ) order by provider.display_name, workshop.display_name)
      from public.workshops workshop
      join public.service_providers provider
        on provider.id = workshop.service_provider_id
      left join public.workshop_subscriptions subscription
        on subscription.workshop_id = workshop.id
      left join lateral (
        select assignment.workshop_manager_id, manager.display_name
        from public.workshop_manager_assignments assignment
        join public.workshop_manager_profiles manager
          on manager.id = assignment.workshop_manager_id
        where assignment.workshop_id = workshop.id
          and assignment.assignment_role = 'primary_manager'
          and assignment.status in ('invited', 'active', 'suspended')
        limit 1
      ) primary_assignment on true), '[]'::jsonb),
    'managers', coalesce((select jsonb_agg(jsonb_build_object(
      'id', manager.id, 'authUserId', manager.auth_user_id,
      'displayName', manager.display_name, 'profileStatus', manager.status,
      'accountStatus', identity.status, 'email', users.email
    ) order by manager.display_name)
      from public.workshop_manager_profiles manager
      join public.account_identities identity
        on identity.auth_user_id = manager.auth_user_id
      join auth.users users on users.id = manager.auth_user_id), '[]'::jsonb),
    'accounts', coalesce((select jsonb_agg(jsonb_build_object(
      'authUserId', identity.auth_user_id,
      'accountType', identity.target_account_type,
      'status', identity.status, 'email', users.email,
      'customerId', (select customer.id from public.customer_profiles customer
        where customer.auth_user_id = identity.auth_user_id),
      'managerId', (select manager.id from public.workshop_manager_profiles manager
        where manager.auth_user_id = identity.auth_user_id),
      'displayName', coalesce(
        (select customer.full_name from public.customer_profiles customer
          where customer.auth_user_id = identity.auth_user_id),
        (select manager.display_name from public.workshop_manager_profiles manager
          where manager.auth_user_id = identity.auth_user_id),
        (select administrator.display_name from public.application_administrators administrator
          where administrator.auth_user_id = identity.auth_user_id),
        users.email
      )
    ) order by identity.assigned_at desc)
      from public.account_identities identity
      join auth.users users on users.id = identity.auth_user_id), '[]'::jsonb),
    'invitations', coalesce((select jsonb_agg(jsonb_build_object(
      'id', invitation.id, 'email', invitation.email,
      'kind', invitation.invitation_kind, 'status', invitation.status,
      'providerName', provider.display_name,
      'workshopName', workshop.display_name,
      'expiresAt', invitation.expires_at, 'createdAt', invitation.created_at
    ) order by invitation.created_at desc)
      from public.service_provider_invitations invitation
      join public.service_providers provider
        on provider.id = invitation.service_provider_id
      left join public.workshops workshop on workshop.id = invitation.workshop_id),
      '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create function private.handle_service_provider_invitation_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.service_provider_invitations%rowtype;
  manager_id uuid;
  normalized_name text := nullif(btrim(new.raw_user_meta_data->>'full_name'), '');
  requested_invitation_id uuid;
  requested_digest text;
begin
  if nullif(new.raw_user_meta_data->>'service_provider_invitation_id', '') is null
    then return new;
  end if;
  requested_invitation_id :=
    (new.raw_user_meta_data->>'service_provider_invitation_id')::uuid;
  requested_digest :=
    new.raw_user_meta_data->>'service_provider_invitation_digest';
  if normalized_name is null or char_length(normalized_name) > 160 then
    raise exception 'A valid invited manager name is required' using errcode = '23514';
  end if;
  select candidate.* into invitation
  from public.service_provider_invitations candidate
  where candidate.id = requested_invitation_id
    and candidate.token_digest = requested_digest
    and candidate.email = lower(new.email)
    and candidate.status = 'pending'
    and candidate.expires_at > now()
  for update;
  if invitation.id is null then
    raise exception 'Invitation is invalid or expired' using errcode = '23514';
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
  end if;
  insert into public.account_identities (
    auth_user_id, account_type, target_account_type, status
  ) values (new.id, 'clinic_manager', 'workshop_manager', 'active');
  update public.service_provider_invitations
  set status = 'accepted', accepted_at = now(),
    accepted_by_auth_user_id = new.id
  where id = invitation.id;
  return new;
end;
$$;

revoke all on function private.handle_service_provider_invitation_registration()
  from public, anon, authenticated;

create trigger pitster_service_provider_invitation_registration
after insert on auth.users
for each row execute function private.handle_service_provider_invitation_registration();

revoke all on function public.create_admin_service_organisation_invitation(
  text, text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.create_admin_workshop_location(
  uuid, text, text, text, text, numeric, numeric, text, text
) from public, anon, authenticated;
revoke all on function public.create_admin_location_manager_invitation(
  uuid, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.assign_admin_workshop_manager(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.set_admin_platform_account_status(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.get_admin_organisation_workflow()
  from public, anon, authenticated;

grant execute on function public.create_admin_service_organisation_invitation(
  text, text, text, text, text, timestamptz
) to authenticated;
grant execute on function public.create_admin_workshop_location(
  uuid, text, text, text, text, numeric, numeric, text, text
) to authenticated;
grant execute on function public.create_admin_location_manager_invitation(
  uuid, text, text, text, timestamptz
) to authenticated;
grant execute on function public.assign_admin_workshop_manager(uuid, uuid, text)
  to authenticated;
grant execute on function public.set_admin_platform_account_status(uuid, text, text)
  to authenticated;
grant execute on function public.get_admin_organisation_workflow()
  to authenticated;

comment on function public.create_admin_service_organisation_invitation(
  text, text, text, text, text, timestamptz
) is 'Creates a pending service organisation and a hashed owner invitation; it never stores or returns the plaintext token.';
comment on function public.set_admin_platform_account_status(uuid, text, text)
  is 'Role-neutral audited account control with self-lockout, hierarchy, and last-Superadmin protection.';

commit;
