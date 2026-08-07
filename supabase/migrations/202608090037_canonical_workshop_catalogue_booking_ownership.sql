begin;

-- Make the canonical automotive workshop the owner of catalogue and booking rows.
-- The renamed legacy identifiers are retained as nullable, trigger-maintained
-- rollback references, but no longer carry referential integrity.
alter table public.workshop_services
  rename column workshop_id to legacy_workshop_profile_id;

alter table public.service_booking_requests
  rename column workshop_id to legacy_workshop_profile_id;

alter table public.workshop_services
  add column workshop_id uuid;

alter table public.service_booking_requests
  add column workshop_id uuid;

update public.workshop_services service
set workshop_id = workshop.id
from public.workshops workshop
where workshop.legacy_workshop_profile_id = service.legacy_workshop_profile_id;

update public.service_booking_requests booking
set workshop_id = workshop.id
from public.workshops workshop
where workshop.legacy_workshop_profile_id = booking.legacy_workshop_profile_id;

do $$
begin
  if exists (select 1 from public.workshop_services where workshop_id is null) then
    raise exception 'Cannot migrate catalogue: a legacy workshop profile has no canonical workshop';
  end if;
  if exists (select 1 from public.service_booking_requests where workshop_id is null) then
    raise exception 'Cannot migrate bookings: a legacy workshop profile has no canonical workshop';
  end if;
  if exists (
    select 1
    from public.service_booking_requests booking
    join public.workshop_services service on service.id = booking.service_id
    where booking.workshop_id <> service.workshop_id
  ) then
    raise exception 'Cannot migrate bookings: a service belongs to a different canonical workshop';
  end if;
end;
$$;

alter table public.workshop_services
  alter column workshop_id set not null,
  alter column legacy_workshop_profile_id drop not null,
  drop constraint workshop_services_workshop_id_fkey,
  drop constraint workshop_services_workshop_id_name_key,
  add constraint workshop_services_workshop_id_fkey
    foreign key (workshop_id) references public.workshops(id) on delete restrict,
  add constraint workshop_services_workshop_id_name_key unique (workshop_id, name),
  add constraint workshop_services_id_workshop_id_key unique (id, workshop_id);

alter table public.service_booking_requests
  alter column workshop_id set not null,
  alter column legacy_workshop_profile_id drop not null,
  drop constraint service_booking_requests_workshop_id_fkey,
  drop constraint service_booking_requests_service_id_fkey,
  add constraint service_booking_requests_workshop_id_fkey
    foreign key (workshop_id) references public.workshops(id) on delete restrict,
  add constraint service_booking_requests_service_workshop_fkey
    foreign key (service_id, workshop_id)
    references public.workshop_services(id, workshop_id) on delete restrict;

drop index public.workshop_services_public_idx;
create index workshop_services_public_idx
  on public.workshop_services(workshop_id, active, display_order, name);

drop index public.workshop_services_standard_code_idx;
create unique index workshop_services_standard_code_idx
  on public.workshop_services(workshop_id, vehicle_type, service_code)
  where service_code is not null;

drop index public.service_booking_requests_workshop_idx;
create index service_booking_requests_workshop_idx
  on public.service_booking_requests(workshop_id, status, preferred_start);

create function private.sync_legacy_workshop_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare legacy_profile_id uuid;
begin
  select workshop.legacy_workshop_profile_id
  into legacy_profile_id
  from public.workshops workshop
  where workshop.id = new.workshop_id;
  new.legacy_workshop_profile_id := legacy_profile_id;
  return new;
end;
$$;

revoke all on function private.sync_legacy_workshop_reference()
  from public, anon, authenticated;

create trigger workshop_services_sync_legacy_workshop_reference
before insert or update of workshop_id, legacy_workshop_profile_id
on public.workshop_services
for each row execute function private.sync_legacy_workshop_reference();

create trigger service_booking_requests_sync_legacy_workshop_reference
before insert or update of workshop_id, legacy_workshop_profile_id
on public.service_booking_requests
for each row execute function private.sync_legacy_workshop_reference();

create or replace function private.can_manage_workshop(requested_workshop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_automotive_workshop(requested_workshop_id)
$$;

-- Legacy profile creation must no longer create catalogue rows. Canonical
-- workshops receive their own initially unpublished Diagnosis offering.
drop trigger if exists workshop_profiles_ensure_initial_diagnosis
  on public.workshop_profiles;

create or replace function private.ensure_initial_diagnosis_service()
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

create trigger workshops_ensure_initial_diagnosis
after insert on public.workshops
for each row execute function private.ensure_initial_diagnosis_service();

-- The v3 catalogue contract uses canonical workshop and service-provider names.
create function public.get_my_workshop_service_catalogue_v3()
returns table (
  workshop_id uuid, service_provider_id uuid, workshop_name text,
  service_id uuid, service_code text, service_name text, category text,
  description text, vehicle_type public.automotive_vehicle_type,
  booking_mode public.workshop_service_booking_mode,
  estimated_duration_minutes integer, price_from_cents integer,
  currency char(3), requires_diagnosis boolean, active boolean,
  display_order integer
)
language sql stable security definer set search_path = ''
as $$
  select workshop.id, provider.id, workshop.display_name,
    service.id, service.service_code, service.name, service.category,
    service.description, service.vehicle_type, service.booking_mode,
    service.estimated_duration_minutes, service.price_from_cents,
    service.currency, service.requires_diagnosis, service.active,
    service.display_order
  from public.workshops workshop
  join public.service_providers provider
    on provider.id = workshop.service_provider_id
  left join public.workshop_services service on service.workshop_id = workshop.id
  where private.can_manage_automotive_workshop(workshop.id)
    and workshop.status = 'active' and provider.status = 'active'
  order by provider.display_name, workshop.display_name,
    service.display_order nulls last, service.name nulls last
$$;

revoke all on function public.get_my_workshop_service_catalogue_v3()
  from public, anon, authenticated;
grant execute on function public.get_my_workshop_service_catalogue_v3()
  to authenticated;

create function public.create_managed_workshop_service_v3(
  requested_workshop_id uuid, new_service_code text, new_name text,
  new_category text, new_description text,
  new_vehicle_type public.automotive_vehicle_type,
  new_booking_mode public.workshop_service_booking_mode,
  new_estimated_duration_minutes integer, new_price_from_cents integer,
  new_currency text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare created_service_id uuid; next_display_order integer;
begin
  if not private.can_manage_automotive_workshop(requested_workshop_id) then
    raise exception 'Workshop manager access required' using errcode = '42501';
  end if;
  select coalesce(max(service.display_order), 0) + 1 into next_display_order
  from public.workshop_services service
  where service.workshop_id = requested_workshop_id;
  insert into public.workshop_services (
    workshop_id, service_code, name, category, description, vehicle_type,
    booking_mode, estimated_duration_minutes, price_from_cents, currency,
    requires_diagnosis, display_order
  ) values (
    requested_workshop_id, nullif(btrim(new_service_code), ''), btrim(new_name),
    btrim(new_category), nullif(btrim(new_description), ''), new_vehicle_type,
    new_booking_mode, new_estimated_duration_minutes, new_price_from_cents,
    upper(btrim(new_currency)), new_booking_mode = 'diagnosis_first',
    next_display_order
  ) returning id into created_service_id;
  return created_service_id;
end;
$$;

revoke all on function public.create_managed_workshop_service_v3(
  uuid, text, text, text, text, public.automotive_vehicle_type,
  public.workshop_service_booking_mode, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.create_managed_workshop_service_v3(
  uuid, text, text, text, text, public.automotive_vehicle_type,
  public.workshop_service_booking_mode, integer, integer, text
) to authenticated;

create function public.update_managed_workshop_service_v3(
  requested_service_id uuid, new_name text, new_category text,
  new_description text, new_vehicle_type public.automotive_vehicle_type,
  new_booking_mode public.workshop_service_booking_mode,
  new_estimated_duration_minutes integer, new_price_from_cents integer,
  new_currency text, new_display_order integer
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.workshop_services service set
    name = case when service.service_code = 'diagnosis' then 'Diagnosis' else btrim(new_name) end,
    category = btrim(new_category),
    description = nullif(btrim(new_description), ''),
    vehicle_type = new_vehicle_type,
    booking_mode = case when service.service_code = 'diagnosis'
      then 'diagnosis'::public.workshop_service_booking_mode else new_booking_mode end,
    estimated_duration_minutes = new_estimated_duration_minutes,
    price_from_cents = new_price_from_cents,
    currency = upper(btrim(new_currency)),
    requires_diagnosis = service.service_code <> 'diagnosis'
      and new_booking_mode = 'diagnosis_first',
    display_order = case when service.service_code = 'diagnosis'
      then 0 else greatest(new_display_order, 1) end
  where service.id = requested_service_id
    and private.can_manage_automotive_workshop(service.workshop_id);
  if not found then
    raise exception 'Workshop service is unavailable' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.update_managed_workshop_service_v3(
  uuid, text, text, text, public.automotive_vehicle_type,
  public.workshop_service_booking_mode, integer, integer, text, integer
) from public, anon, authenticated;
grant execute on function public.update_managed_workshop_service_v3(
  uuid, text, text, text, public.automotive_vehicle_type,
  public.workshop_service_booking_mode, integer, integer, text, integer
) to authenticated;

create or replace function public.set_managed_workshop_service_active(
  requested_service_id uuid, new_active boolean
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.workshop_services service set active = new_active
  where service.id = requested_service_id
    and private.can_manage_automotive_workshop(service.workshop_id);
  if not found then
    raise exception 'Workshop service is unavailable' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.search_public_workshops(requested_search text default null)
returns table (
  workshop_id uuid, display_name text, description text, country_code char(2),
  city text, practice_address text, latitude numeric, longitude numeric,
  public_phone text, public_email text, offers_pickup boolean,
  offers_courtesy_car boolean, service_categories text[], price_from_cents integer
)
language sql stable security definer set search_path = ''
as $$
  select workshop.id, workshop.display_name, workshop.description,
    workshop.country_code, workshop.city, workshop.address,
    workshop.latitude, workshop.longitude, workshop.public_phone,
    workshop.public_email, workshop.offers_pickup, workshop.offers_courtesy_car,
    coalesce(summary.categories, array[]::text[]), summary.price_from_cents
  from public.workshops workshop
  join public.service_providers provider on provider.id = workshop.service_provider_id
  left join lateral (
    select array_agg(distinct service.category order by service.category) categories,
      min(service.price_from_cents) price_from_cents
    from public.workshop_services service
    where service.workshop_id = workshop.id and service.active
  ) summary on true
  where provider.status = 'active' and workshop.status = 'active'
    and workshop.accepts_booking_requests
    and (nullif(btrim(requested_search), '') is null
      or concat_ws(' ', workshop.display_name, workshop.description,
        workshop.city, workshop.address, array_to_string(summary.categories, ' '))
        ilike '%' || btrim(requested_search) || '%')
  order by workshop.display_name
$$;

create or replace function public.get_public_workshop_services_v2(requested_workshop_id uuid)
returns table (
  service_id uuid, service_code text, name text, category text,
  description text, vehicle_type public.automotive_vehicle_type,
  booking_mode public.workshop_service_booking_mode,
  estimated_duration_minutes integer, price_from_cents integer,
  currency char(3), requires_diagnosis boolean,
  diagnosis_fee_cents integer, diagnosis_currency char(3)
)
language sql stable security definer set search_path = ''
as $$
  select service.id, service.service_code, service.name, service.category,
    service.description, service.vehicle_type, service.booking_mode,
    service.estimated_duration_minutes, service.price_from_cents,
    service.currency, service.requires_diagnosis,
    diagnosis.price_from_cents, diagnosis.currency
  from public.workshop_services service
  join public.workshops workshop on workshop.id = service.workshop_id
  join public.service_providers provider on provider.id = workshop.service_provider_id
  left join lateral (
    select fee.price_from_cents, fee.currency
    from public.workshop_services fee
    where fee.workshop_id = service.workshop_id
      and fee.service_code = 'diagnosis' and fee.active and fee.price_from_cents > 0
    order by (fee.vehicle_type = service.vehicle_type) desc limit 1
  ) diagnosis on true
  where workshop.id = requested_workshop_id
    and workshop.accepts_booking_requests and workshop.status = 'active'
    and provider.status = 'active' and service.active
    and (service.booking_mode <> 'diagnosis_first'
      or diagnosis.price_from_cents is not null)
  order by service.display_order, service.name
$$;

create or replace function public.get_public_workshop_services(requested_workshop_id uuid)
returns table (
  service_id uuid, name text, category text, description text,
  estimated_duration_minutes integer, price_from_cents integer,
  currency char(3), requires_diagnosis boolean
)
language sql stable security definer set search_path = ''
as $$
  select service.id, service.name, service.category, service.description,
    service.estimated_duration_minutes, service.price_from_cents,
    service.currency, service.requires_diagnosis
  from public.workshops workshop
  join public.service_providers provider
    on provider.id = workshop.service_provider_id
  join public.workshop_services service on service.workshop_id = workshop.id
  where workshop.id = requested_workshop_id
    and provider.status = 'active' and workshop.status = 'active'
    and workshop.accepts_booking_requests and service.active
  order by service.display_order, service.name
$$;

create or replace function public.create_public_service_booking_request(
  requested_workshop_id uuid, requested_service_id uuid,
  requested_customer_name text, requested_customer_phone text,
  requested_customer_email text, requested_vehicle_registration text,
  requested_vehicle_make text, requested_vehicle_model text,
  requested_vehicle_year integer, requested_mileage_km integer,
  requested_preferred_start timestamptz, requested_alternate_start timestamptz,
  requested_customer_note text, requested_mobility_requirement text,
  requested_locale text, requested_management_token_digest text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  created_request_id uuid; resolved_customer_id uuid; resolved_vehicle_id uuid;
  workshop_row public.workshops%rowtype; requested_local timestamp;
  requested_weekday smallint; open_time time; close_time time;
  requests_on_day integer;
begin
  select workshop.* into workshop_row
  from public.workshops workshop
  join public.service_providers provider
    on provider.id = workshop.service_provider_id and provider.status = 'active'
  where workshop.id = requested_workshop_id
    and workshop.status = 'active' and workshop.accepts_booking_requests
  for update of workshop;

  if workshop_row.id is null or not exists (
    select 1 from public.workshop_services service
    where service.id = requested_service_id
      and service.workshop_id = requested_workshop_id and service.active
  ) then
    raise exception 'Workshop service is unavailable' using errcode = 'P0002';
  end if;
  if requested_preferred_start < now() + make_interval(mins => workshop_row.minimum_lead_minutes)
    or requested_preferred_start > now() + make_interval(days => workshop_row.booking_horizon_days) then
    raise exception 'Requested time is outside the booking window' using errcode = '23514';
  end if;
  if requested_mobility_requirement = 'pickup' and not workshop_row.offers_pickup
    or requested_mobility_requirement = 'courtesy_car' and not workshop_row.offers_courtesy_car
    or requested_mobility_requirement = 'wait_on_site' and not workshop_row.allows_wait_on_site then
    raise exception 'Requested mobility option is unavailable' using errcode = '23514';
  end if;

  requested_local := requested_preferred_start at time zone workshop_row.time_zone;
  requested_weekday := extract(dow from requested_local)::smallint;
  if extract(minute from requested_local)::integer % workshop_row.slot_interval_minutes <> 0
    or extract(second from requested_local) <> 0 then
    raise exception 'Requested time does not match the workshop slot interval'
      using errcode = '23514';
  end if;
  select hours.opens_at, hours.closes_at into open_time, close_time
  from public.workshop_operating_hours hours
  where hours.workshop_id = workshop_row.id
    and hours.weekday = requested_weekday and not hours.closed;
  if open_time is null or requested_local::time < open_time
    or requested_local::time >= close_time then
    raise exception 'Workshop is closed at the requested time' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.workshop_closures closure
    where closure.workshop_id = workshop_row.id
      and requested_preferred_start >= closure.starts_at
      and requested_preferred_start < closure.ends_at
  ) then
    raise exception 'Workshop is closed at the requested time' using errcode = '23514';
  end if;

  select count(*) into requests_on_day
  from public.service_booking_requests booking
  where booking.workshop_id = requested_workshop_id
    and booking.status in ('requested', 'confirmed')
    and (coalesce(booking.confirmed_start, booking.preferred_start)
      at time zone workshop_row.time_zone)::date = requested_local::date;
  if requests_on_day >= workshop_row.daily_booking_capacity then
    raise exception 'Workshop booking capacity has been reached' using errcode = '23514';
  end if;

  select customer.id into resolved_customer_id
  from public.customer_profiles customer
  where customer.auth_user_id = (select auth.uid());
  if resolved_customer_id is not null then
    select vehicle.id into resolved_vehicle_id
    from public.vehicles vehicle
    where vehicle.customer_id = resolved_customer_id
      and upper(vehicle.registration_number) = upper(btrim(requested_vehicle_registration))
    limit 1;
  end if;

  insert into public.service_booking_requests (
    workshop_id, service_id, customer_id, vehicle_id,
    customer_name, customer_phone, customer_email,
    vehicle_registration, vehicle_make, vehicle_model, vehicle_year, mileage_km,
    preferred_start, alternate_start, customer_note, mobility_requirement,
    locale, management_token_digest
  ) values (
    requested_workshop_id, requested_service_id, resolved_customer_id,
    resolved_vehicle_id, btrim(requested_customer_name),
    btrim(requested_customer_phone), lower(btrim(requested_customer_email)),
    upper(btrim(requested_vehicle_registration)), btrim(requested_vehicle_make),
    btrim(requested_vehicle_model), requested_vehicle_year, requested_mileage_km,
    requested_preferred_start, requested_alternate_start,
    nullif(btrim(requested_customer_note), ''),
    nullif(requested_mobility_requirement, 'none'), requested_locale,
    decode(requested_management_token_digest, 'hex')
  ) returning id into created_request_id;
  return created_request_id;
end;
$$;

create function public.create_managed_service_appointment_v2(
  requested_workshop_id uuid, requested_service_id uuid,
  requested_start timestamptz, requested_duration_minutes integer,
  requested_source text, requested_customer_name text,
  requested_customer_phone text, requested_customer_email text,
  requested_vehicle_registration text, requested_vehicle_make text,
  requested_vehicle_model text, requested_vehicle_year integer,
  requested_mileage_km integer, requested_note text, requested_locale text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare manager_id uuid; created_booking_id uuid;
begin
  if not private.can_manage_automotive_workshop(requested_workshop_id) then
    raise exception 'Workshop manager access required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.workshop_services service
    where service.id = requested_service_id
      and service.workshop_id = requested_workshop_id and service.active
  ) then
    raise exception 'Workshop service is unavailable' using errcode = 'P0002';
  end if;
  if requested_start < now() - interval '24 hours'
    or requested_duration_minutes not between 15 and 1440
    or requested_source not in ('manager_phone', 'manager_walk_in', 'manager_other')
    or requested_locale not in ('en', 'de', 'ro', 'hu') then
    raise exception 'Invalid manual appointment details' using errcode = '23514';
  end if;
  select manager.id into manager_id
  from public.workshop_manager_profiles manager
  where manager.auth_user_id = (select auth.uid()) and manager.status = 'active';

  insert into public.service_booking_requests (
    workshop_id, service_id, customer_name, customer_phone, customer_email,
    vehicle_registration, vehicle_make, vehicle_model, vehicle_year,
    mileage_km, preferred_start, confirmed_start, customer_note, locale,
    status, management_token_digest, booking_source, duration_minutes
  ) values (
    requested_workshop_id, requested_service_id, btrim(requested_customer_name),
    nullif(btrim(requested_customer_phone), ''),
    nullif(lower(btrim(requested_customer_email)), ''),
    upper(btrim(requested_vehicle_registration)), btrim(requested_vehicle_make),
    btrim(requested_vehicle_model), requested_vehicle_year,
    requested_mileage_km, requested_start, requested_start,
    nullif(btrim(requested_note), ''), requested_locale, 'confirmed',
    digest(gen_random_uuid()::text || clock_timestamp()::text, 'sha256'),
    requested_source, requested_duration_minutes
  ) returning id into created_booking_id;

  insert into public.service_booking_request_history (
    booking_request_id, action, previous_status, new_status,
    new_confirmed_start, note, actor_workshop_manager_id
  ) values (
    created_booking_id, 'manager_created', null, 'confirmed', requested_start,
    nullif(btrim(requested_note), ''), manager_id
  );
  return created_booking_id;
end;
$$;

revoke all on function public.create_managed_service_appointment_v2(
  uuid, uuid, timestamptz, integer, text, text, text, text,
  text, text, text, integer, integer, text, text
) from public, anon, authenticated;
grant execute on function public.create_managed_service_appointment_v2(
  uuid, uuid, timestamptz, integer, text, text, text, text,
  text, text, text, integer, integer, text, text
) to authenticated;

revoke execute on function public.create_managed_service_appointment(
  uuid, uuid, timestamptz, integer, text, text, text, text,
  text, text, text, integer, integer, text, text
) from authenticated;

create or replace function public.get_managed_service_booking_requests(
  requested_status text default null
)
returns table (
  booking_id uuid, workshop_id uuid, workshop_name text,
  service_name text, service_category text,
  booking_status public.service_booking_status,
  customer_name text, customer_phone text, customer_email text,
  vehicle_registration text, vehicle_make text, vehicle_model text,
  vehicle_year integer, mileage_km integer,
  preferred_start timestamptz, alternate_start timestamptz,
  confirmed_start timestamptz, proposed_start timestamptz,
  proposal_note text, customer_note text, workshop_note text,
  mobility_requirement text, locale text, created_at timestamptz,
  history jsonb
)
language sql stable security definer set search_path = ''
as $$
  select booking.id, workshop.id, workshop.display_name,
    service.name, service.category, booking.status,
    booking.customer_name, booking.customer_phone, booking.customer_email,
    booking.vehicle_registration, booking.vehicle_make, booking.vehicle_model,
    booking.vehicle_year, booking.mileage_km, booking.preferred_start,
    booking.alternate_start, booking.confirmed_start,
    booking.workshop_proposed_start, booking.workshop_proposal_note,
    booking.customer_note, booking.workshop_note, booking.mobility_requirement,
    booking.locale, booking.created_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', history.action, 'previousStatus', history.previous_status,
        'newStatus', history.new_status,
        'previousConfirmedStart', history.previous_confirmed_start,
        'newConfirmedStart', history.new_confirmed_start,
        'proposedStart', history.proposed_start, 'note', history.note,
        'createdAt', history.created_at
      ) order by history.created_at desc)
      from public.service_booking_request_history history
      where history.booking_request_id = booking.id
    ), '[]'::jsonb)
  from public.service_booking_requests booking
  join public.workshop_services service
    on service.id = booking.service_id and service.workshop_id = booking.workshop_id
  join public.workshops workshop on workshop.id = booking.workshop_id
  join public.service_providers provider
    on provider.id = workshop.service_provider_id and provider.status = 'active'
  where private.can_manage_automotive_workshop(booking.workshop_id)
    and (nullif(btrim(requested_status), '') is null
      or booking.status::text = btrim(requested_status))
  order by case booking.status when 'requested' then 0 when 'confirmed' then 1 else 2 end,
    booking.created_at desc
  limit 250
$$;

create or replace function public.get_my_service_booking_requests()
returns table (
  booking_id uuid, workshop_id uuid, workshop_name text,
  workshop_phone text, workshop_email text, workshop_city text,
  workshop_address text, service_name text, service_category text,
  booking_status public.service_booking_status,
  vehicle_registration text, vehicle_make text, vehicle_model text,
  vehicle_year integer, preferred_start timestamptz,
  alternate_start timestamptz, confirmed_start timestamptz,
  proposed_start timestamptz, proposal_note text, customer_note text,
  workshop_note text, created_at timestamptz, can_cancel boolean, history jsonb
)
language sql stable security definer set search_path = ''
as $$
  select booking.id, workshop.id, workshop.display_name,
    workshop.public_phone, workshop.public_email, workshop.city,
    workshop.address, service.name, service.category, booking.status,
    booking.vehicle_registration, booking.vehicle_make, booking.vehicle_model,
    booking.vehicle_year, booking.preferred_start, booking.alternate_start,
    booking.confirmed_start, booking.workshop_proposed_start,
    booking.workshop_proposal_note, booking.customer_note,
    booking.workshop_note, booking.created_at,
    booking.status in ('requested', 'confirmed') and greatest(
      booking.preferred_start, booking.alternate_start,
      booking.confirmed_start, booking.workshop_proposed_start
    ) > now(),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', history.action, 'previousStatus', history.previous_status,
        'newStatus', history.new_status,
        'previousConfirmedStart', history.previous_confirmed_start,
        'newConfirmedStart', history.new_confirmed_start,
        'proposedStart', history.proposed_start, 'note', history.note,
        'createdAt', history.created_at
      ) order by history.created_at desc)
      from public.service_booking_request_history history
      where history.booking_request_id = booking.id
    ), '[]'::jsonb)
  from public.service_booking_requests booking
  join public.customer_profiles customer on customer.id = booking.customer_id
  join public.workshop_services service
    on service.id = booking.service_id and service.workshop_id = booking.workshop_id
  join public.workshops workshop on workshop.id = booking.workshop_id
  where customer.auth_user_id = (select auth.uid())
  order by case booking.status when 'requested' then 0 when 'confirmed' then 1 else 2 end,
    coalesce(booking.confirmed_start, booking.preferred_start) desc,
    booking.created_at desc
  limit 250
$$;

create or replace function public.claim_due_service_booking_notifications(
  requested_limit integer default 20, requested_booking_id uuid default null
)
returns table (
  notification_id uuid, booking_id uuid,
  notification_kind public.service_booking_notification_kind,
  destination_phone text, locale text, customer_name text,
  workshop_name text, service_name text, vehicle_registration text,
  confirmed_start timestamptz, timezone text
)
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  with claimed as (
    select notification.id
    from public.service_booking_notifications notification
    join public.service_booking_requests booking
      on booking.id = notification.booking_request_id
    where (notification.status in ('pending', 'failed')
        or (notification.status = 'processing'
          and notification.claimed_at < now() - interval '10 minutes'))
      and notification.attempt_count < 5
      and notification.scheduled_for <= now()
      and (requested_booking_id is null or booking.id = requested_booking_id)
      and case notification.kind
        when 'reminder_24h' then booking.status = 'confirmed' and booking.confirmed_start > now()
        when 'booking_confirmed' then booking.status not in ('declined', 'cancelled', 'no_show')
        when 'repair_started' then booking.status in ('in_service', 'ready_for_collection', 'completed')
        when 'ready_for_pickup' then booking.status in ('ready_for_collection', 'completed')
        when 'review_request' then booking.status = 'completed'
      end
    order by notification.scheduled_for
    for update of notification skip locked
    limit greatest(1, least(requested_limit, 100))
  ), updated as (
    update public.service_booking_notifications notification set
      status = 'processing', attempt_count = notification.attempt_count + 1,
      claimed_at = now()
    from claimed where notification.id = claimed.id
    returning notification.*
  )
  select updated.id, booking.id, updated.kind, updated.destination_phone,
    booking.locale, booking.customer_name, workshop.display_name,
    service.name, booking.vehicle_registration, booking.confirmed_start,
    workshop.time_zone
  from updated
  join public.service_booking_requests booking
    on booking.id = updated.booking_request_id
  join public.workshop_services service
    on service.id = booking.service_id and service.workshop_id = booking.workshop_id
  join public.workshops workshop on workshop.id = booking.workshop_id;
end;
$$;

create or replace function public.get_automotive_admin_snapshot()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not private.is_active_platform_admin() then
    raise exception 'Platform Administrator access required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'generatedAt', now(),
    'counts', jsonb_build_object(
      'providers', (select count(*) from public.service_providers),
      'workshops', (select count(*) from public.workshops),
      'customers', (select count(*) from public.customer_profiles),
      'managers', (select count(*) from public.workshop_manager_profiles),
      'openBookings', (select count(*) from public.service_booking_requests
        where status in ('requested', 'confirmed', 'checked_in', 'diagnosing',
          'awaiting_approval', 'in_service', 'ready_for_collection')),
      'smsAttention', (select count(*) from public.service_booking_notifications
        where status = 'failed' and attempt_count < 5)
    ),
    'providers', coalesce((select jsonb_agg(jsonb_build_object(
      'id', provider.id, 'displayName', provider.display_name,
      'legalName', provider.legal_name, 'countryCode', provider.country_code,
      'status', provider.status, 'workshopCount', (select count(*)
        from public.workshops workshop where workshop.service_provider_id = provider.id),
      'managerCount', (select count(*)
        from public.workshop_manager_memberships membership
        where membership.service_provider_id = provider.id and membership.status = 'active'),
      'createdAt', provider.created_at
    ) order by provider.created_at desc) from public.service_providers provider), '[]'::jsonb),
    'workshops', coalesce((select jsonb_agg(jsonb_build_object(
      'id', workshop.id, 'displayName', workshop.display_name,
      'providerName', provider.display_name, 'city', workshop.city,
      'countryCode', workshop.country_code, 'status', workshop.status,
      'acceptsBookings', workshop.accepts_booking_requests,
      'openBookingCount', (select count(*) from public.service_booking_requests booking
        where booking.workshop_id = workshop.id
          and booking.status in ('requested', 'confirmed', 'checked_in', 'diagnosing',
            'awaiting_approval', 'in_service', 'ready_for_collection')),
      'createdAt', workshop.created_at
    ) order by workshop.created_at desc)
      from public.workshops workshop join public.service_providers provider
        on provider.id = workshop.service_provider_id), '[]'::jsonb),
    'customers', coalesce((select jsonb_agg(jsonb_build_object(
      'id', customer.id, 'fullName', customer.full_name, 'phone', customer.phone,
      'vehicleCount', (select count(*) from public.vehicles vehicle
        where vehicle.customer_id = customer.id),
      'bookingCount', (select count(*) from public.service_booking_requests booking
        where booking.customer_id = customer.id),
      'createdAt', customer.created_at
    ) order by customer.created_at desc) from public.customer_profiles customer), '[]'::jsonb),
    'managers', coalesce((select jsonb_agg(jsonb_build_object(
      'id', manager.id, 'displayName', manager.display_name, 'status', manager.status,
      'providerNames', coalesce((select jsonb_agg(provider.display_name order by provider.display_name)
        from public.workshop_manager_memberships membership
        join public.service_providers provider on provider.id = membership.service_provider_id
        where membership.workshop_manager_id = manager.id and membership.status = 'active'), '[]'::jsonb),
      'createdAt', manager.created_at
    ) order by manager.created_at desc) from public.workshop_manager_profiles manager), '[]'::jsonb),
    'sms', coalesce((select jsonb_agg(jsonb_build_object(
      'kind', kinds.kind,
      'pending', (select count(*) from public.service_booking_notifications notification
        where notification.kind = kinds.kind and notification.status in ('pending', 'processing')),
      'sent', (select count(*) from public.service_booking_notifications notification
        where notification.kind = kinds.kind and notification.status = 'sent'),
      'failed', (select count(*) from public.service_booking_notifications notification
        where notification.kind = kinds.kind and notification.status = 'failed')
    ) order by kinds.kind::text)
      from unnest(enum_range(null::public.service_booking_notification_kind)) kinds(kind)), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Retire application access to catalogue functions whose contracts expose
-- clinic IDs or legacy workshop-profile ownership.
revoke execute on function public.get_my_workshop_service_catalogue_v2()
  from authenticated;
revoke execute on function public.get_my_workshop_service_catalogue()
  from authenticated;
revoke execute on function public.create_managed_workshop_service(
  uuid, text, text, text, integer, integer, text, boolean
) from authenticated;
revoke execute on function public.update_managed_workshop_service(
  uuid, text, text, text, integer, integer, text, boolean, integer
) from authenticated;
revoke execute on function public.create_managed_workshop_service_v2(
  uuid, text, text, text, text, public.automotive_vehicle_type,
  public.workshop_service_booking_mode, integer, integer, text
) from authenticated;
revoke execute on function public.update_managed_workshop_service_v2(
  uuid, text, text, text, public.automotive_vehicle_type,
  public.workshop_service_booking_mode, integer, integer, text, integer
) from authenticated;

comment on column public.workshop_services.workshop_id is
  'Canonical workshop owner. This is the authoritative catalogue relationship.';
comment on column public.workshop_services.legacy_workshop_profile_id is
  'Nullable compatibility reference maintained from the canonical workshop during legacy retirement.';
comment on column public.service_booking_requests.workshop_id is
  'Canonical workshop owner. This is the authoritative booking relationship.';
comment on column public.service_booking_requests.legacy_workshop_profile_id is
  'Nullable compatibility reference maintained from the canonical workshop during legacy retirement.';

commit;
