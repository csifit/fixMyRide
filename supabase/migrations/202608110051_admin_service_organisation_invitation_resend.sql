begin;

alter table public.platform_organisation_admin_history
  drop constraint platform_organisation_admin_history_action_check;
alter table public.platform_organisation_admin_history
  add constraint platform_organisation_admin_history_action_check check (action in (
    'organisation_invited', 'organisation_invitation_resent',
    'organisation_updated', 'organisation_status_changed',
    'organisation_deleted', 'location_created', 'location_updated',
    'location_coverage_assigned', 'manager_invited', 'manager_assigned',
    'account_status_changed'
  ));

create function public.resend_admin_service_organisation_invitation(
  requested_invitation_id uuid,
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
  invitation_row public.service_provider_invitations%rowtype;
  provider_name text;
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required'
      using errcode = '42501';
  end if;
  if requested_invitation_id is null
    or requested_token_digest !~ '^[a-f0-9]{64}$'
    or requested_expires_at <= now()
    or requested_expires_at > now() + interval '30 days' then
    raise exception 'Valid organisation invitation resend details are required'
      using errcode = '22023';
  end if;

  select invitation.* into invitation_row
  from public.service_provider_invitations invitation
  join public.service_providers provider
    on provider.id = invitation.service_provider_id
  where invitation.id = requested_invitation_id
    and invitation.invitation_kind = 'organisation_owner'
    and invitation.status = 'pending'
    and provider.deleted_at is null
  for update of invitation;

  if invitation_row.id is null then
    raise exception 'Pending service organisation invitation not found'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from auth.users users
    where lower(users.email) = invitation_row.email
  ) then
    raise exception 'An account already uses this invitation email'
      using errcode = '23505';
  end if;

  actor_id := private.current_platform_administrator_id();
  select provider.display_name into provider_name
  from public.service_providers provider
  where provider.id = invitation_row.service_provider_id;

  update public.service_provider_invitations
  set token_digest = requested_token_digest,
    expires_at = requested_expires_at,
    invited_by_auth_user_id = (select auth.uid())
  where id = invitation_row.id;

  insert into public.platform_organisation_admin_history (
    action, service_provider_id, invitation_id,
    actor_administrator_id, details
  ) values (
    'organisation_invitation_resent',
    invitation_row.service_provider_id,
    invitation_row.id,
    actor_id,
    jsonb_build_object(
      'previousExpiresAt', invitation_row.expires_at,
      'expiresAt', requested_expires_at
    )
  );

  return jsonb_build_object(
    'invitationId', invitation_row.id,
    'serviceProviderId', invitation_row.service_provider_id,
    'email', invitation_row.email,
    'providerName', provider_name
  );
end;
$$;

revoke all on function public.resend_admin_service_organisation_invitation(
  uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.resend_admin_service_organisation_invitation(
  uuid, text, timestamptz
) to authenticated;

comment on function public.resend_admin_service_organisation_invitation(
  uuid, text, timestamptz
) is 'Rotates and reissues a pending service organisation owner invitation for an MFA-authenticated platform administrator without storing or returning the plaintext token.';

commit;
