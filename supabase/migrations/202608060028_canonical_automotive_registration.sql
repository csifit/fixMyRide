begin;

-- Application cutover: new public registrations use automotive role names.
-- Workshop-manager creation still dual-writes the legacy organization objects
-- so the existing approval console remains usable until the admin conversion.
create or replace function private.handle_public_account_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  registration_type text := new.raw_user_meta_data->>'registration_type';
  normalized_name text := nullif(btrim(new.raw_user_meta_data->>'full_name'), '');
  compatibility_manager_id uuid;
  compatibility_provider_id uuid;
begin
  if registration_type is null then
    return new;
  end if;
  if registration_type not in ('customer', 'workshop_manager') then
    raise exception 'Unsupported public registration type'
      using errcode = '23514';
  end if;
  if normalized_name is null or char_length(normalized_name) > 160 then
    raise exception 'A valid full name is required'
      using errcode = '23514';
  end if;

  if registration_type = 'customer' then
    insert into public.customer_profiles (auth_user_id, full_name)
    values (new.id, normalized_name);
    insert into public.account_identities (auth_user_id, account_type)
    values (new.id, 'patient');
  else
    insert into public.clinic_manager_profiles (
      auth_user_id, display_name, status
    ) values (new.id, normalized_name, 'pending')
    returning id into compatibility_manager_id;

    insert into public.clinics (
      legal_name, display_name, country_code, status
    ) values (
      nullif(btrim(new.raw_user_meta_data->>'service_provider_legal_name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'service_provider_display_name'), ''),
      upper(nullif(btrim(new.raw_user_meta_data->>'service_provider_country'), '')),
      'pending'
    ) returning id into compatibility_provider_id;

    insert into public.clinic_manager_memberships (
      clinic_id, clinic_manager_id, membership_role, status
    ) values (
      compatibility_provider_id, compatibility_manager_id, 'owner', 'active'
    );
    insert into public.billing_profiles (clinic_id)
    values (compatibility_provider_id);
  end if;
  return new;
end;
$$;

revoke all on function private.handle_public_account_registration()
  from public, anon, authenticated;

comment on function private.handle_public_account_registration() is
  'Creates canonical customer or workshop-manager identities. Legacy manager organization writes are an explicit temporary admin-console compatibility bridge.';

commit;
