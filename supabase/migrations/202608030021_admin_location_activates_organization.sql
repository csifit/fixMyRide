begin;

-- Activating a location is also the explicit Admin approval of its parent
-- organization. This removes the invisible pending-organization prerequisite.
create or replace function public.create_admin_clinic_location(
  requested_clinic_id uuid,
  new_display_name text,
  new_country_code text,
  new_description text,
  new_public_phone text,
  new_public_email text,
  new_city text,
  new_address text,
  new_latitude numeric,
  new_longitude numeric,
  new_status public.organization_status,
  request_correlation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.current_platform_administrator_id();
  location_id uuid;
begin
  if actor_id is null then
    raise insufficient_privilege;
  end if;

  if new_status = 'active' then
    update public.clinics as clinic
       set status = 'active'
     where clinic.id = requested_clinic_id;

    if not found then
      raise exception 'Clinic organization not found' using errcode = 'P0002';
    end if;
  end if;

  select public.create_admin_clinic_location(
    requested_clinic_id,
    new_display_name,
    new_country_code,
    new_description,
    new_public_phone,
    new_public_email,
    new_city,
    new_address,
    new_latitude,
    new_longitude,
    new_status,
    null::date,
    null::date,
    request_correlation_id
  )
  into location_id;

  return location_id;
end;
$$;

create or replace function public.update_admin_clinic_location(
  requested_location_id uuid,
  new_display_name text,
  new_country_code text,
  new_description text,
  new_public_phone text,
  new_public_email text,
  new_city text,
  new_address text,
  new_latitude numeric,
  new_longitude numeric,
  new_status public.organization_status,
  status_reason text,
  request_correlation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.current_platform_administrator_id();
  organization_id uuid;
begin
  if actor_id is null then
    raise insufficient_privilege;
  end if;

  select location.clinic_id
    into organization_id
    from public.clinic_locations as location
   where location.id = requested_location_id;

  if organization_id is null then
    raise exception 'Clinic location not found' using errcode = 'P0002';
  end if;

  if new_status = 'active' then
    update public.clinics as clinic
       set status = 'active'
     where clinic.id = organization_id;
  end if;

  perform public.update_admin_clinic_location(
    requested_location_id,
    new_display_name,
    new_country_code,
    new_description,
    new_public_phone,
    new_public_email,
    new_city,
    new_address,
    new_latitude,
    new_longitude,
    new_status,
    null::date,
    null::date,
    status_reason,
    request_correlation_id
  );
end;
$$;

revoke all on function public.create_admin_clinic_location(uuid, text, text, text, text, text, text, text, numeric, numeric, public.organization_status, uuid) from public, anon;
grant execute on function public.create_admin_clinic_location(uuid, text, text, text, text, text, text, text, numeric, numeric, public.organization_status, uuid) to authenticated;

revoke all on function public.update_admin_clinic_location(uuid, text, text, text, text, text, text, text, numeric, numeric, public.organization_status, text, uuid) from public, anon;
grant execute on function public.update_admin_clinic_location(uuid, text, text, text, text, text, text, text, numeric, numeric, public.organization_status, text, uuid) to authenticated;

commit;
