begin;

-- Persist the structural comparison used to authorize forward-sync shutdown.
-- Mutable profile values are intentionally not copied back: canonical rows
-- became authoritative in migrations 028-037.
create table private.legacy_sync_retirement_audits (
  id uuid primary key default gen_random_uuid(),
  captured_at timestamptz not null default now(),
  migration_name text not null unique,
  comparison jsonb not null
);

revoke all on table private.legacy_sync_retirement_audits
  from public, anon, authenticated;

do $$
begin
  if exists (
    select 1 from public.clinics legacy
    left join public.service_providers canonical on canonical.id = legacy.id
    where canonical.id is null
  ) then
    raise exception 'Forward-sync retirement blocked: a clinic has no canonical service provider';
  end if;

  if exists (
    select 1 from public.clinic_manager_profiles legacy
    left join public.workshop_manager_profiles canonical
      on canonical.id = legacy.id and canonical.auth_user_id = legacy.auth_user_id
    where canonical.id is null
  ) then
    raise exception 'Forward-sync retirement blocked: a clinic manager has no matching canonical manager';
  end if;

  if exists (
    select 1 from public.clinic_manager_memberships legacy
    left join public.workshop_manager_memberships canonical
      on canonical.id = legacy.id
      and canonical.service_provider_id = legacy.clinic_id
      and canonical.workshop_manager_id = legacy.clinic_manager_id
      and canonical.membership_role::text = legacy.membership_role::text
      and canonical.status = legacy.status
    where canonical.id is null
  ) then
    raise exception 'Forward-sync retirement blocked: a manager membership is not structurally equivalent';
  end if;

  if exists (
    select 1 from public.workshop_profiles legacy
    left join public.workshops canonical
      on canonical.legacy_workshop_profile_id = legacy.id
    where canonical.id is null
  ) then
    raise exception 'Forward-sync retirement blocked: a workshop profile is not mapped';
  end if;

  if exists (
    select 1 from public.clinic_locations legacy
    left join public.workshops canonical
      on canonical.legacy_clinic_location_id = legacy.id
    where canonical.id is null
  ) then
    raise exception 'Forward-sync retirement blocked: a clinic location is not mapped';
  end if;

  if exists (
    select 1 from public.patients legacy
    left join public.customer_profiles canonical
      on canonical.auth_user_id = legacy.auth_user_id
    where legacy.auth_user_id is not null and canonical.id is null
  ) then
    raise exception 'Forward-sync retirement blocked: a linked patient has no canonical customer';
  end if;

  if exists (
    select 1 from public.account_identities identity
    where identity.target_account_type is distinct from
      private.map_legacy_account_type(identity.account_type)
  ) then
    raise exception 'Forward-sync retirement blocked: an account identity role is inconsistent';
  end if;
end;
$$;

insert into private.legacy_sync_retirement_audits (migration_name, comparison)
values (
  '202608090038_retire_legacy_forward_sync',
  jsonb_build_object(
    'clinics', jsonb_build_object(
      'legacyCount', (select count(*) from public.clinics),
      'mappedCount', (select count(*) from public.clinics legacy
        join public.service_providers canonical on canonical.id = legacy.id),
      'legacyIdChecksum', (select md5(coalesce(string_agg(id::text, ',' order by id), '')) from public.clinics),
      'canonicalIdChecksum', (select md5(coalesce(string_agg(canonical.id::text, ',' order by canonical.id), ''))
        from public.service_providers canonical join public.clinics legacy on legacy.id = canonical.id)
    ),
    'managers', jsonb_build_object(
      'legacyCount', (select count(*) from public.clinic_manager_profiles),
      'mappedCount', (select count(*) from public.clinic_manager_profiles legacy
        join public.workshop_manager_profiles canonical
          on canonical.id = legacy.id and canonical.auth_user_id = legacy.auth_user_id),
      'legacyChecksum', (select md5(coalesce(string_agg(id::text || ':' || auth_user_id::text, ',' order by id), ''))
        from public.clinic_manager_profiles),
      'canonicalChecksum', (select md5(coalesce(string_agg(canonical.id::text || ':' || canonical.auth_user_id::text, ',' order by canonical.id), ''))
        from public.workshop_manager_profiles canonical
        join public.clinic_manager_profiles legacy on legacy.id = canonical.id)
    ),
    'memberships', jsonb_build_object(
      'legacyCount', (select count(*) from public.clinic_manager_memberships),
      'mappedCount', (select count(*) from public.clinic_manager_memberships legacy
        join public.workshop_manager_memberships canonical on canonical.id = legacy.id),
      'legacyChecksum', (select md5(coalesce(string_agg(
        id::text || ':' || clinic_id::text || ':' || clinic_manager_id::text,
        ',' order by id), '')) from public.clinic_manager_memberships),
      'canonicalChecksum', (select md5(coalesce(string_agg(
        canonical.id::text || ':' || canonical.service_provider_id::text || ':' || canonical.workshop_manager_id::text,
        ',' order by canonical.id), ''))
        from public.workshop_manager_memberships canonical
        join public.clinic_manager_memberships legacy on legacy.id = canonical.id)
    ),
    'workshopProfiles', jsonb_build_object(
      'legacyCount', (select count(*) from public.workshop_profiles),
      'mappedCount', (select count(*) from public.workshop_profiles legacy
        join public.workshops canonical on canonical.legacy_workshop_profile_id = legacy.id)
    ),
    'clinicLocations', jsonb_build_object(
      'legacyCount', (select count(*) from public.clinic_locations),
      'mappedCount', (select count(*) from public.clinic_locations legacy
        join public.workshops canonical on canonical.legacy_clinic_location_id = legacy.id)
    ),
    'linkedPatients', jsonb_build_object(
      'legacyCount', (select count(*) from public.patients where auth_user_id is not null),
      'mappedCount', (select count(*) from public.patients legacy
        join public.customer_profiles canonical on canonical.auth_user_id = legacy.auth_user_id
        where legacy.auth_user_id is not null)
    ),
    'accountIdentities', jsonb_build_object(
      'count', (select count(*) from public.account_identities),
      'consistentCount', (select count(*) from public.account_identities identity
        where identity.target_account_type = private.map_legacy_account_type(identity.account_type))
    )
  )
);

alter table public.account_identities
  add constraint account_identities_canonical_role_consistent check (
    target_account_type = private.map_legacy_account_type(account_type)
  );

-- New registrations now create only canonical automotive records. The legacy
-- account_type value remains a temporary required compatibility shadow.
create or replace function private.handle_public_account_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  registration_type text := new.raw_user_meta_data->>'registration_type';
  normalized_name text := nullif(btrim(new.raw_user_meta_data->>'full_name'), '');
  manager_id uuid;
  provider_id uuid;
  provider_legal_name text;
  provider_display_name text;
  provider_country char(2);
begin
  if registration_type is null then return new; end if;
  if registration_type not in ('customer', 'workshop_manager') then
    raise exception 'Unsupported public registration type' using errcode = '23514';
  end if;
  if normalized_name is null or char_length(normalized_name) > 160 then
    raise exception 'A valid full name is required' using errcode = '23514';
  end if;

  if registration_type = 'customer' then
    insert into public.customer_profiles (auth_user_id, full_name)
    values (new.id, normalized_name);
    insert into public.account_identities (
      auth_user_id, account_type, target_account_type
    ) values (new.id, 'patient', 'customer');
    return new;
  end if;

  provider_legal_name := nullif(btrim(
    new.raw_user_meta_data->>'service_provider_legal_name'
  ), '');
  provider_display_name := nullif(btrim(
    new.raw_user_meta_data->>'service_provider_display_name'
  ), '');
  provider_country := upper(nullif(btrim(
    new.raw_user_meta_data->>'service_provider_country'
  ), ''));
  if provider_legal_name is null or provider_display_name is null
    or provider_country is null then
    raise exception 'Valid service provider details are required' using errcode = '23514';
  end if;

  insert into public.workshop_manager_profiles (
    auth_user_id, display_name, status
  ) values (new.id, normalized_name, 'pending')
  returning id into manager_id;

  insert into public.service_providers (
    legal_name, display_name, country_code, status
  ) values (
    provider_legal_name, provider_display_name, provider_country, 'pending'
  ) returning id into provider_id;

  insert into public.workshop_manager_memberships (
    service_provider_id, workshop_manager_id, membership_role, status
  ) values (provider_id, manager_id, 'owner', 'active');

  insert into public.workshops (
    id, service_provider_id, slug, display_name, country_code, status
  ) values (
    provider_id, provider_id,
    coalesce(nullif(trim(both '-' from lower(regexp_replace(
      provider_display_name, '[^a-zA-Z0-9]+', '-', 'g'
    ))), ''), 'workshop') || '-' || left(provider_id::text, 8),
    provider_display_name, provider_country, 'pending'
  );

  insert into public.account_identities (
    auth_user_id, account_type, target_account_type
  ) values (new.id, 'clinic_manager', 'workshop_manager');
  return new;
end;
$$;

comment on function private.handle_public_account_registration() is
  'Creates customer or workshop-manager accounts directly in the canonical automotive domain. No legacy organization rows are written.';

-- Disable every legacy-to-canonical forward writer in the same transaction as
-- the canonical registration cutover.
drop trigger if exists patients_sync_customer_profile on public.patients;
drop trigger if exists clinics_ensure_workshop_profile on public.clinics;
drop trigger if exists account_identities_sync_target_account_type on public.account_identities;
drop trigger if exists clinics_sync_service_provider on public.clinics;
drop trigger if exists clinic_manager_profiles_sync_workshop_manager on public.clinic_manager_profiles;
drop trigger if exists clinic_manager_memberships_sync_workshop_manager on public.clinic_manager_memberships;
drop trigger if exists clinics_refresh_automotive_workshops on public.clinics;
drop trigger if exists clinic_locations_refresh_automotive_workshops on public.clinic_locations;
drop trigger if exists workshop_profiles_refresh_automotive_workshops on public.workshop_profiles;

drop function public.sync_customer_profile_from_patient();
drop function public.ensure_workshop_profile_for_clinic();
drop function private.sync_target_account_type();
drop function private.sync_service_provider_from_clinic();
drop function private.sync_workshop_manager_profile_from_legacy();
drop function private.sync_workshop_manager_membership_from_legacy();
drop function private.refresh_automotive_workshops_from_clinic();
drop function private.refresh_automotive_workshops_from_location();
drop function private.refresh_automotive_workshops_from_profile();
drop function private.refresh_automotive_workshops(uuid);

-- These source tables are now retention-only. Freezing them prevents a legacy
-- RPC or direct privileged write from creating post-comparison drift.
create function private.reject_retired_legacy_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'This legacy record is read-only after canonical cutover'
    using errcode = '55000';
end;
$$;

revoke all on function private.reject_retired_legacy_mutation()
  from public, anon, authenticated;

create trigger patients_reject_post_cutover_mutation
before insert or update or delete on public.patients
for each row execute function private.reject_retired_legacy_mutation();

create trigger clinics_reject_post_cutover_mutation
before insert or update or delete on public.clinics
for each row execute function private.reject_retired_legacy_mutation();

create trigger clinic_locations_reject_post_cutover_mutation
before insert or update or delete on public.clinic_locations
for each row execute function private.reject_retired_legacy_mutation();

create trigger workshop_profiles_reject_post_cutover_mutation
before insert or update or delete on public.workshop_profiles
for each row execute function private.reject_retired_legacy_mutation();

create trigger clinic_manager_profiles_reject_post_cutover_mutation
before insert or update or delete on public.clinic_manager_profiles
for each row execute function private.reject_retired_legacy_mutation();

create trigger clinic_manager_memberships_reject_post_cutover_mutation
before insert or update or delete on public.clinic_manager_memberships
for each row execute function private.reject_retired_legacy_mutation();

commit;
