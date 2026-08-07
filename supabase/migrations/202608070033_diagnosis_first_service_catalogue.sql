begin;

create type public.automotive_vehicle_type as enum (
  'car_van',
  'motorcycle_scooter',
  'electric_bicycle',
  'electric_kick_scooter'
);

create type public.workshop_service_booking_mode as enum (
  'diagnosis',
  'diagnosis_first',
  'direct'
);

alter table public.workshop_services
  add column service_code text,
  add column vehicle_type public.automotive_vehicle_type not null default 'car_van',
  add column booking_mode public.workshop_service_booking_mode not null default 'direct';

update public.workshop_services
set booking_mode = case
  when requires_diagnosis then 'diagnosis_first'::public.workshop_service_booking_mode
  else 'direct'::public.workshop_service_booking_mode
end;

update public.workshop_services
set display_order = display_order + 1;

update public.workshop_services service set
  service_code = 'diagnosis',
  name = 'Diagnosis',
  category = 'Diagnostics and inspections',
  booking_mode = 'diagnosis',
  requires_diagnosis = false,
  active = service.active and coalesce(service.price_from_cents > 0, false),
  display_order = 0
where service.id in (
  select distinct on (candidate.workshop_id) candidate.id
  from public.workshop_services candidate
  where lower(btrim(candidate.name)) in ('diagnosis', 'diagnostics', 'diagnose')
  order by candidate.workshop_id,
    case lower(btrim(candidate.name)) when 'diagnosis' then 0 else 1 end,
    candidate.active desc, candidate.display_order, candidate.id
);

insert into public.workshop_services (
  workshop_id, service_code, name, category, description,
  estimated_duration_minutes, price_from_cents, currency,
  requires_diagnosis, booking_mode, active, display_order
)
select
  workshop.id, 'diagnosis', 'Diagnosis', 'Diagnostics and inspections',
  'Initial diagnostic assessment. The fee remains payable when further repair work is declined.',
  60, null, 'EUR', false, 'diagnosis', false, 0
from public.workshop_profiles workshop
where not exists (
  select 1 from public.workshop_services service
  where service.workshop_id = workshop.id
    and service.service_code = 'diagnosis'
);

create unique index workshop_services_standard_code_idx
  on public.workshop_services(workshop_id, vehicle_type, service_code)
  where service_code is not null;

alter table public.workshop_services
  add constraint workshop_services_diagnosis_fee_required check (
    service_code is distinct from 'diagnosis'
    or not active
    or (price_from_cents is not null and price_from_cents > 0)
  ),
  add constraint workshop_services_diagnosis_mode_consistent check (
    service_code is distinct from 'diagnosis' or booking_mode = 'diagnosis'
  );

create function private.normalize_workshop_service_booking_mode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.service_code = 'diagnosis' then
    new.name := 'Diagnosis';
    new.category := 'Diagnostics and inspections';
    new.booking_mode := 'diagnosis';
    new.requires_diagnosis := false;
    new.display_order := 0;
  elsif tg_op = 'INSERT' then
    if new.requires_diagnosis then
      new.booking_mode := 'diagnosis_first';
    else
      new.requires_diagnosis := new.booking_mode = 'diagnosis_first';
    end if;
  elsif new.booking_mode is not distinct from old.booking_mode
    and new.requires_diagnosis is distinct from old.requires_diagnosis then
    new.booking_mode := case when new.requires_diagnosis
      then 'diagnosis_first'::public.workshop_service_booking_mode
      else 'direct'::public.workshop_service_booking_mode end;
  else
    new.requires_diagnosis := new.booking_mode = 'diagnosis_first';
  end if;
  return new;
end;
$$;

revoke all on function private.normalize_workshop_service_booking_mode()
  from public, anon, authenticated;

create trigger workshop_services_normalize_booking_mode
before insert or update on public.workshop_services
for each row execute function private.normalize_workshop_service_booking_mode();

create function private.ensure_initial_diagnosis_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workshop_services (
    workshop_id, service_code, name, category, description,
    estimated_duration_minutes, price_from_cents, currency,
    requires_diagnosis, booking_mode, active, display_order
  ) values (
    new.id, 'diagnosis', 'Diagnosis', 'Diagnostics and inspections',
    'Initial diagnostic assessment. The fee remains payable when further repair work is declined.',
    60, null, 'EUR', false, 'diagnosis', false, 0
  ) on conflict do nothing;
  return new;
end;
$$;

revoke all on function private.ensure_initial_diagnosis_service()
  from public, anon, authenticated;

create trigger workshop_profiles_ensure_initial_diagnosis
after insert on public.workshop_profiles
for each row execute function private.ensure_initial_diagnosis_service();

create function public.get_my_workshop_service_catalogue_v2()
returns table (
  workshop_id uuid, clinic_id uuid, workshop_name text,
  service_id uuid, service_code text, service_name text, category text,
  description text, vehicle_type public.automotive_vehicle_type,
  booking_mode public.workshop_service_booking_mode,
  estimated_duration_minutes integer, price_from_cents integer,
  currency char(3), requires_diagnosis boolean, active boolean,
  display_order integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select workshop.id, clinic.id, clinic.display_name,
    service.id, service.service_code, service.name, service.category,
    service.description, service.vehicle_type, service.booking_mode,
    service.estimated_duration_minutes, service.price_from_cents,
    service.currency, service.requires_diagnosis, service.active,
    service.display_order
  from public.clinic_manager_profiles manager
  join public.clinic_manager_memberships membership
    on membership.clinic_manager_id = manager.id
    and membership.status = 'active'
    and membership.membership_role in ('owner', 'manager')
  join public.clinics clinic on clinic.id = membership.clinic_id
  join public.workshop_profiles workshop on workshop.clinic_id = clinic.id
  left join public.workshop_services service on service.workshop_id = workshop.id
  where manager.auth_user_id = (select auth.uid())
    and manager.status = 'active'
  order by clinic.display_name, service.display_order nulls last,
    service.name nulls last
$$;

revoke all on function public.get_my_workshop_service_catalogue_v2()
  from public, anon, authenticated;
grant execute on function public.get_my_workshop_service_catalogue_v2()
  to authenticated;

create function public.create_managed_workshop_service_v2(
  requested_clinic_id uuid, new_service_code text, new_name text,
  new_category text, new_description text,
  new_vehicle_type public.automotive_vehicle_type,
  new_booking_mode public.workshop_service_booking_mode,
  new_estimated_duration_minutes integer, new_price_from_cents integer,
  new_currency text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_workshop_id uuid;
  created_service_id uuid;
  next_display_order integer;
begin
  if not exists (
    select 1 from public.clinic_manager_memberships membership
    join public.clinic_manager_profiles manager
      on manager.id = membership.clinic_manager_id
    where membership.clinic_id = requested_clinic_id
      and membership.status = 'active'
      and membership.membership_role in ('owner', 'manager')
      and manager.auth_user_id = (select auth.uid())
      and manager.status = 'active'
  ) then
    raise exception 'Workshop manager access required' using errcode = '42501';
  end if;

  select workshop.id into resolved_workshop_id
  from public.workshop_profiles workshop
  where workshop.clinic_id = requested_clinic_id;

  if resolved_workshop_id is null then
    raise exception 'Workshop is unavailable' using errcode = 'P0002';
  end if;

  select coalesce(max(service.display_order), 0) + 1 into next_display_order
  from public.workshop_services service
  where service.workshop_id = resolved_workshop_id;

  insert into public.workshop_services (
    workshop_id, service_code, name, category, description, vehicle_type,
    booking_mode, estimated_duration_minutes, price_from_cents, currency,
    requires_diagnosis, display_order
  ) values (
    resolved_workshop_id, nullif(btrim(new_service_code), ''), btrim(new_name),
    btrim(new_category), nullif(btrim(new_description), ''), new_vehicle_type,
    new_booking_mode, new_estimated_duration_minutes, new_price_from_cents,
    upper(btrim(new_currency)), new_booking_mode = 'diagnosis_first',
    next_display_order
  ) returning id into created_service_id;
  return created_service_id;
end;
$$;

revoke all on function public.create_managed_workshop_service_v2(
  uuid, text, text, text, text, public.automotive_vehicle_type,
  public.workshop_service_booking_mode, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.create_managed_workshop_service_v2(
  uuid, text, text, text, text, public.automotive_vehicle_type,
  public.workshop_service_booking_mode, integer, integer, text
) to authenticated;

create function public.update_managed_workshop_service_v2(
  requested_service_id uuid, new_name text, new_category text,
  new_description text, new_vehicle_type public.automotive_vehicle_type,
  new_booking_mode public.workshop_service_booking_mode,
  new_estimated_duration_minutes integer, new_price_from_cents integer,
  new_currency text, new_display_order integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.workshop_services service set
    name = case when service.service_code = 'diagnosis' then 'Diagnosis'
      else btrim(new_name) end,
    category = btrim(new_category),
    description = nullif(btrim(new_description), ''),
    vehicle_type = new_vehicle_type,
    booking_mode = case when service.service_code = 'diagnosis'
      then 'diagnosis'::public.workshop_service_booking_mode
      else new_booking_mode end,
    estimated_duration_minutes = new_estimated_duration_minutes,
    price_from_cents = new_price_from_cents,
    currency = upper(btrim(new_currency)),
    requires_diagnosis = service.service_code <> 'diagnosis'
      and new_booking_mode = 'diagnosis_first',
    display_order = case when service.service_code = 'diagnosis'
      then 0 else greatest(new_display_order, 1) end
  where service.id = requested_service_id
    and private.can_manage_workshop(service.workshop_id);

  if not found then
    raise exception 'Workshop service is unavailable' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.update_managed_workshop_service_v2(
  uuid, text, text, text, public.automotive_vehicle_type,
  public.workshop_service_booking_mode, integer, integer, text, integer
) from public, anon, authenticated;
grant execute on function public.update_managed_workshop_service_v2(
  uuid, text, text, text, public.automotive_vehicle_type,
  public.workshop_service_booking_mode, integer, integer, text, integer
) to authenticated;

create function public.get_public_workshop_services_v2(requested_workshop_id uuid)
returns table (
  service_id uuid, service_code text, name text, category text,
  description text, vehicle_type public.automotive_vehicle_type,
  booking_mode public.workshop_service_booking_mode,
  estimated_duration_minutes integer, price_from_cents integer,
  currency char(3), requires_diagnosis boolean,
  diagnosis_fee_cents integer, diagnosis_currency char(3)
)
language sql
stable
security definer
set search_path = ''
as $$
  select service.id, service.service_code, service.name, service.category,
    service.description, service.vehicle_type, service.booking_mode,
    service.estimated_duration_minutes, service.price_from_cents,
    service.currency, service.requires_diagnosis,
    diagnosis.price_from_cents, diagnosis.currency
  from public.workshop_services service
  join public.workshop_profiles workshop on workshop.id = service.workshop_id
  join public.clinics clinic on clinic.id = workshop.clinic_id
  left join lateral (
    select fee.price_from_cents, fee.currency
    from public.workshop_services fee
    where fee.workshop_id = service.workshop_id
      and fee.service_code = 'diagnosis'
      and fee.active
      and fee.price_from_cents > 0
    order by (fee.vehicle_type = service.vehicle_type) desc
    limit 1
  ) diagnosis on true
  where workshop.id = requested_workshop_id
    and workshop.accepts_booking_requests
    and clinic.status = 'active'
    and service.active
    and (
      service.booking_mode <> 'diagnosis_first'
      or diagnosis.price_from_cents is not null
    )
  order by service.display_order, service.name
$$;

revoke all on function public.get_public_workshop_services_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_workshop_services_v2(uuid)
  to anon, authenticated;

comment on column public.workshop_services.booking_mode is
  'Direct services can be booked as listed; diagnosis-first services disclose the workshop diagnostic fee before repair estimation.';
comment on constraint workshop_services_diagnosis_fee_required on public.workshop_services is
  'The standard Diagnosis offering must have a positive workshop-defined fee before publication.';

commit;
