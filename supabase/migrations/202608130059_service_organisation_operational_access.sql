begin;

-- Organisation owners can operate every workshop owned by their organisation.
-- Location managers remain restricted to workshops with a live assignment.
create or replace function private.current_workshop_manager_id(
  requested_workshop_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select manager.id
  from public.workshops workshop
  join public.service_providers provider
    on provider.id = workshop.service_provider_id
    and provider.status = 'active'
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
  left join public.workshop_manager_assignments assignment
    on assignment.workshop_id = workshop.id
    and assignment.workshop_manager_id = manager.id
    and assignment.status = 'active'
    and assignment.starts_on <= current_date
    and (assignment.ends_before is null
      or assignment.ends_before > current_date)
  where workshop.id = requested_workshop_id
    and workshop.status in ('pending', 'active')
    and manager.auth_user_id = (select auth.uid())
    and (
      membership.membership_role = 'owner'
      or (
        membership.membership_role = 'manager'
        and assignment.id is not null
      )
    )
  order by
    (membership.membership_role = 'owner') desc,
    (assignment.assignment_role = 'primary_manager') desc nulls last,
    assignment.created_at nulls last
  limit 1
$$;

comment on function private.current_workshop_manager_id(uuid) is
  'Resolves operational workshop access: organisation owners cover every owned location; managers require an active location assignment.';

commit;
