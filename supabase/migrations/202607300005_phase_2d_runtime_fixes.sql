begin;

-- Phase 2D was applied after the original fictional clinicians were created.
-- Give those existing doctors the same empty billing profile that newly
-- registered doctors receive from the registration trigger.
insert into public.billing_profiles (clinician_id)
select clinician.id
from public.clinicians clinician
where clinician.auth_user_id is not null
  and not exists (
    select 1
    from public.billing_profiles profile
    where profile.clinician_id = clinician.id
  );

-- Keep the SECURITY DEFINER search path empty while relying only on
-- pg_catalog functions for invitation token generation and hashing.
create or replace function public.create_clinic_doctor_invitation(
  requested_clinic_id uuid,
  requested_email text,
  request_correlation_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  manager_id uuid;
  invitation_id uuid;
  raw_token text :=
    replace(pg_catalog.gen_random_uuid()::text, '-', '')
    || replace(pg_catalog.gen_random_uuid()::text, '-', '');
  normalized_email text := lower(btrim(requested_email));
  metadata jsonb := '{"changed_fields":["invitation_status"]}'::jsonb;
begin
  select manager.id into manager_id
  from public.clinic_manager_profiles manager
  join public.clinic_manager_memberships membership
    on membership.clinic_manager_id = manager.id
  join public.clinics clinic on clinic.id = membership.clinic_id
  where manager.auth_user_id = auth.uid()
    and manager.status = 'active'
    and membership.clinic_id = requested_clinic_id
    and membership.status = 'active'
    and clinic.status = 'active';
  if manager_id is null
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise insufficient_privilege;
  end if;
  insert into public.organization_invitations (
    invitation_kind, clinic_id, inviting_manager_id, invited_email,
    token_digest, expires_at
  ) values (
    'clinic_doctor', requested_clinic_id, manager_id, normalized_email,
    pg_catalog.sha256(pg_catalog.convert_to(raw_token, 'UTF8')),
    now() + interval '7 days'
  )
  returning id into invitation_id;
  perform public.assert_safe_audit_metadata(metadata);
  insert into public.audit_events (
    actor_auth_user_id, actor_clinic_manager_id, action, resource_type,
    resource_id, correlation_id, safe_metadata
  ) values (
    auth.uid(), manager_id, 'organization_invitation_created',
    'organization_invitations', invitation_id, request_correlation_id, metadata
  );
  return raw_token;
end;
$$;

create or replace function public.create_doctor_staff_invitation(
  requested_email text,
  request_correlation_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinician_id uuid;
  invitation_id uuid;
  raw_token text :=
    replace(pg_catalog.gen_random_uuid()::text, '-', '')
    || replace(pg_catalog.gen_random_uuid()::text, '-', '');
  normalized_email text := lower(btrim(requested_email));
  metadata jsonb := '{"changed_fields":["invitation_status"]}'::jsonb;
begin
  select clinician.id into clinician_id
  from public.clinicians clinician
  where clinician.auth_user_id = auth.uid()
    and clinician.verification_status = 'approved';
  if clinician_id is null
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise insufficient_privilege;
  end if;
  insert into public.organization_invitations (
    invitation_kind, inviting_clinician_id, invited_email,
    token_digest, expires_at
  ) values (
    'doctor_staff', clinician_id, normalized_email,
    pg_catalog.sha256(pg_catalog.convert_to(raw_token, 'UTF8')),
    now() + interval '7 days'
  )
  returning id into invitation_id;
  perform public.assert_safe_audit_metadata(metadata);
  insert into public.audit_events (
    actor_auth_user_id, actor_clinician_id, action, resource_type,
    resource_id, correlation_id, safe_metadata
  ) values (
    auth.uid(), clinician_id, 'organization_invitation_created',
    'organization_invitations', invitation_id, request_correlation_id, metadata
  );
  return raw_token;
end;
$$;

create or replace function private.handle_public_account_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  registration_type text := new.raw_user_meta_data->>'registration_type';
  normalized_name text := nullif(btrim(new.raw_user_meta_data->>'full_name'), '');
  clinic_manager_id uuid;
  clinic_id uuid;
  clinician_id uuid;
  staff_id uuid;
  numeric_vitapass_id text;
begin
  if registration_type is null then
    return new;
  end if;
  if registration_type not in (
    'patient', 'doctor', 'clinic_manager', 'staff'
  ) then
    raise exception 'Unsupported public registration type'
      using errcode = '23514';
  end if;
  if normalized_name is null or char_length(normalized_name) > 160 then
    raise exception 'A valid full name is required'
      using errcode = '23514';
  end if;

  if registration_type = 'patient' then
    numeric_vitapass_id := to_char(
      nextval('public.vitapass_id_sequence'::regclass),
      'FM00000000'
    );
    insert into public.patients (
      auth_user_id, vitapass_id, full_name, date_of_birth, sex
    ) values (
      new.id,
      'VP-' || left(numeric_vitapass_id, 4) || '-'
        || right(numeric_vitapass_id, 4),
      normalized_name,
      (new.raw_user_meta_data->>'date_of_birth')::date,
      new.raw_user_meta_data->>'sex'
    );
  elsif registration_type = 'doctor' then
    insert into public.clinicians (
      auth_user_id, full_name, specialty, clinic_name, clinic_country,
      professional_identifier, verification_status
    ) values (
      new.id,
      normalized_name,
      nullif(btrim(new.raw_user_meta_data->>'specialty'), ''),
      nullif(btrim(new.raw_user_meta_data->>'clinic_name'), ''),
      upper(nullif(btrim(new.raw_user_meta_data->>'clinic_country'), '')),
      nullif(btrim(new.raw_user_meta_data->>'professional_identifier'), ''),
      'pending'
    )
    returning id into clinician_id;
    insert into public.billing_profiles (clinician_id)
    values (clinician_id);
    if nullif(new.raw_user_meta_data->>'invitation_token', '') is not null then
      update public.organization_invitations invitation set
        status = 'accepted', accepted_at = now()
      where invitation.invitation_kind = 'clinic_doctor'
        and invitation.status = 'pending'
        and invitation.expires_at > now()
        and invitation.invited_email = lower(new.email)
        and invitation.token_digest = pg_catalog.sha256(
          pg_catalog.convert_to(
            new.raw_user_meta_data->>'invitation_token',
            'UTF8'
          )
        )
      returning invitation.clinic_id, invitation.inviting_manager_id
      into clinic_id, clinic_manager_id;
      if clinic_id is null then
        raise exception 'The doctor invitation is invalid or expired'
          using errcode = '23514';
      end if;
      insert into public.clinic_doctor_memberships (
        clinic_id, clinician_id, status, starts_on, invited_by_manager_id
      ) values (
        clinic_id, clinician_id, 'active', current_date, clinic_manager_id
      );
      insert into public.clinic_sponsorship_periods (
        clinic_id, clinician_id, effective_from, created_by_manager_id
      ) values (
        clinic_id, clinician_id, current_date, clinic_manager_id
      );
    end if;
  elsif registration_type = 'staff' then
    update public.organization_invitations invitation set
      status = 'accepted', accepted_at = now()
    where invitation.invitation_kind = 'doctor_staff'
      and invitation.status = 'pending'
      and invitation.expires_at > now()
      and invitation.invited_email = lower(new.email)
      and invitation.token_digest = pg_catalog.sha256(
        pg_catalog.convert_to(
          new.raw_user_meta_data->>'invitation_token',
          'UTF8'
        )
      )
    returning invitation.inviting_clinician_id into clinician_id;
    if clinician_id is null then
      raise exception 'The staff invitation is invalid or expired'
        using errcode = '23514';
    end if;
    insert into public.staff_profiles (
      auth_user_id, display_name, status, invited_by_clinician_id
    ) values (new.id, normalized_name, 'active', clinician_id)
    returning id into staff_id;
    insert into public.staff_doctor_assignments (
      staff_id, clinician_id, status, starts_on
    ) values (staff_id, clinician_id, 'active', current_date);
  else
    insert into public.clinic_manager_profiles (
      auth_user_id, display_name, status
    ) values (new.id, normalized_name, 'pending')
    returning id into clinic_manager_id;
    insert into public.clinics (
      legal_name, display_name, country_code, status
    ) values (
      nullif(btrim(new.raw_user_meta_data->>'clinic_legal_name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'clinic_display_name'), ''),
      upper(nullif(btrim(new.raw_user_meta_data->>'clinic_country'), '')),
      'pending'
    )
    returning id into clinic_id;
    insert into public.clinic_manager_memberships (
      clinic_id, clinic_manager_id, membership_role, status
    ) values (clinic_id, clinic_manager_id, 'owner', 'active');
    insert into public.billing_profiles (clinic_id)
    values (clinic_id);
  end if;
  return new;
end;
$$;

commit;
