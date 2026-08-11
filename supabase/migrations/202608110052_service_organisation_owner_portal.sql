begin;

create function private.activate_accepted_service_organisation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.invitation_kind = 'organisation_owner'
    and new.status = 'accepted'
    and old.status is distinct from new.status then
    update public.service_providers
    set status = 'active'
    where id = new.service_provider_id
      and status = 'pending';
  end if;
  return new;
end;
$$;

revoke all on function private.activate_accepted_service_organisation()
  from public, anon, authenticated;

create trigger service_provider_invitations_activate_organisation
after update of status on public.service_provider_invitations
for each row execute function private.activate_accepted_service_organisation();

-- Repair organisations whose owner accepted before this lifecycle transition
-- was introduced. Suspended or rejected organisations remain untouched.
update public.service_providers provider
set status = 'active'
where provider.status = 'pending'
  and exists (
    select 1
    from public.service_provider_invitations invitation
    where invitation.service_provider_id = provider.id
      and invitation.invitation_kind = 'organisation_owner'
      and invitation.status = 'accepted'
  );

comment on function private.activate_accepted_service_organisation() is
  'Activates a pending service organisation when its administrator-issued owner invitation is accepted.';

commit;
