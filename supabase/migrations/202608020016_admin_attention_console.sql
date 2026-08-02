begin;

create function private.is_active_platform_admin()
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
      where administrator.auth_user_id = (select auth.uid())
        and administrator.role::text in ('superadmin', 'admin')
        and administrator.status = 'active'
    )
$$;

revoke all on function private.is_active_platform_admin()
  from public, anon, authenticated;

create function public.get_admin_operations_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'counts', jsonb_build_object(
      'attention',
        (select count(*) from public.clinicians where verification_status = 'pending')
        + (select count(*) from public.clinics where status = 'pending')
        + (select count(*) from public.clinic_manager_profiles where status = 'pending')
        + (select count(*) from public.billing_profiles where status = 'incomplete'),
      'doctors', (select count(*) from public.clinicians),
      'patients', (select count(*) from public.patients),
      'clinics', (select count(*) from public.clinics),
      'clinic_managers', (select count(*) from public.clinic_manager_profiles),
      'platform_managers', (
        select count(*) from public.application_administrators
        where role::text = 'manager'
      )
    ),
    'tasks', coalesce((
      select jsonb_agg(task order by task->>'created_at')
      from (
        select jsonb_build_object(
          'id', clinician.id,
          'kind', 'doctor_approval',
          'title', clinician.full_name,
          'detail', clinician.specialty,
          'status', clinician.verification_status,
          'priority', 'high',
          'created_at', clinician.created_at,
          'href', '/admin/doctors'
        ) task
        from public.clinicians clinician
        where clinician.verification_status = 'pending'
        union all
        select jsonb_build_object(
          'id', clinic.id,
          'kind', 'clinic_approval',
          'title', clinic.display_name,
          'detail', clinic.legal_name,
          'status', clinic.status,
          'priority', 'high',
          'created_at', clinic.created_at,
          'href', '/admin/clinics'
        ) task
        from public.clinics clinic
        where clinic.status = 'pending'
        union all
        select jsonb_build_object(
          'id', manager.id,
          'kind', 'clinic_manager_approval',
          'title', manager.display_name,
          'detail', 'Clinic Manager',
          'status', manager.status,
          'priority', 'high',
          'created_at', manager.created_at,
          'href', '/admin/organizations'
        ) task
        from public.clinic_manager_profiles manager
        where manager.status = 'pending'
        union all
        select jsonb_build_object(
          'id', billing.id,
          'kind', 'billing_profile',
          'title', coalesce(clinic.display_name, clinician.full_name, 'Billing profile'),
          'detail', case when billing.clinic_id is not null
            then 'Clinic billing details' else 'Doctor billing details' end,
          'status', billing.status,
          'priority', 'normal',
          'created_at', billing.created_at,
          'href', '/admin/invoicing'
        ) task
        from public.billing_profiles billing
        left join public.clinics clinic on clinic.id = billing.clinic_id
        left join public.clinicians clinician on clinician.id = billing.clinician_id
        where billing.status = 'incomplete'
      ) attention_tasks
    ), '[]'::jsonb),
    'administrators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', administrator.id,
        'display_name', administrator.display_name,
        'role', administrator.role,
        'status', administrator.status,
        'accounting_access', administrator.accounting_access,
        'created_at', administrator.created_at
      ) order by administrator.created_at desc)
      from public.application_administrators administrator
    ), '[]'::jsonb),
    'doctors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', clinician.id,
        'full_name', clinician.full_name,
        'specialty', clinician.specialty,
        'clinic_name', clinician.clinic_name,
        'verification_status', clinician.verification_status,
        'professional_identifier', clinician.professional_identifier,
        'created_at', clinician.created_at
      ) order by clinician.created_at desc)
      from public.clinicians clinician
    ), '[]'::jsonb),
    'patients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', patient.id,
        'vitapass_id', patient.vitapass_id,
        'full_name', patient.full_name,
        'archived', patient.archived_at is not null,
        'created_at', patient.created_at
      ) order by patient.created_at desc)
      from public.patients patient
    ), '[]'::jsonb),
    'clinics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', clinic.id,
        'display_name', clinic.display_name,
        'legal_name', clinic.legal_name,
        'country_code', clinic.country_code,
        'status', clinic.status,
        'city', clinic.city,
        'address', clinic.address,
        'manager_count', (
          select count(*) from public.clinic_manager_memberships membership
          where membership.clinic_id = clinic.id
            and membership.status = 'active'
        ),
        'doctor_count', (
          select count(*) from public.clinic_doctor_memberships membership
          where membership.clinic_id = clinic.id
            and membership.status = 'active'
        ),
        'created_at', clinic.created_at
      ) order by clinic.created_at desc)
      from public.clinics clinic
    ), '[]'::jsonb),
    'clinic_managers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', manager.id,
        'display_name', manager.display_name,
        'status', manager.status,
        'clinic_count', (
          select count(*) from public.clinic_manager_memberships membership
          where membership.clinic_manager_id = manager.id
            and membership.status = 'active'
        ),
        'created_at', manager.created_at
      ) order by manager.created_at desc)
      from public.clinic_manager_profiles manager
    ), '[]'::jsonb)
  ) into snapshot;

  return snapshot;
end;
$$;

revoke all on function public.get_admin_operations_snapshot()
  from public, anon, authenticated;
grant execute on function public.get_admin_operations_snapshot()
  to authenticated;

comment on function public.get_admin_operations_snapshot() is
  'Read-only administrative operations snapshot. It intentionally excludes patient medical records, protected identifiers, access grants, and audit-event contents.';

commit;
