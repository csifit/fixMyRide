begin;

create type public.workshop_inventory_item_type as enum ('part', 'consumable');

create table public.workshop_inventory_items (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete restrict,
  item_name text not null check (char_length(btrim(item_name)) between 2 and 160),
  sku text not null check (char_length(btrim(sku)) between 1 and 80),
  oem_code text check (oem_code is null or char_length(btrim(oem_code)) between 1 and 100),
  item_type public.workshop_inventory_item_type not null,
  quantity numeric(12, 2) not null default 0 check (quantity >= 0 and quantity <= 100000000),
  minimum_quantity numeric(12, 2) not null default 0 check (minimum_quantity >= 0 and minimum_quantity <= 100000000),
  unit text not null default 'piece' check (unit in ('piece', 'litre', 'kilogram', 'set', 'pack')),
  manufacturer text check (manufacturer is null or char_length(btrim(manufacturer)) between 1 and 120),
  vehicle_application text check (vehicle_application is null or char_length(btrim(vehicle_application)) between 1 and 240),
  storage_location text check (storage_location is null or char_length(btrim(storage_location)) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 1000),
  updated_by_workshop_manager_id uuid not null references public.workshop_manager_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index workshop_inventory_workshop_sku_idx
  on public.workshop_inventory_items(workshop_id, lower(sku));

create index workshop_inventory_workshop_type_name_idx
  on public.workshop_inventory_items(workshop_id, item_type, item_name);

create index workshop_inventory_low_stock_idx
  on public.workshop_inventory_items(workshop_id, quantity, minimum_quantity);

create trigger workshop_inventory_items_updated_at
before update on public.workshop_inventory_items
for each row execute function public.set_updated_at();

alter table public.workshop_inventory_items enable row level security;
revoke all on table public.workshop_inventory_items from public, anon, authenticated;

create function private.can_manage_workshop_inventory(requested_workshop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_automotive_workshop(requested_workshop_id)
    or exists (
      select 1
      from public.workshops workshop
      join public.service_providers provider
        on provider.id = workshop.service_provider_id
        and provider.status = 'active'
      where workshop.id = requested_workshop_id
        and workshop.status in ('pending', 'active')
        and private.can_manage_service_organisation(provider.id)
    )
$$;

revoke all on function private.can_manage_workshop_inventory(uuid)
  from public, anon, authenticated;

create function private.current_inventory_manager_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select manager.id
  from public.workshop_manager_profiles manager
  join public.account_identities identity
    on identity.auth_user_id = manager.auth_user_id
    and identity.status = 'active'
  where manager.auth_user_id = (select auth.uid())
    and manager.status = 'active'
  limit 1
$$;

revoke all on function private.current_inventory_manager_id()
  from public, anon, authenticated;

create function public.get_my_workshop_inventory()
returns table (
  workshop_id uuid,
  service_provider_id uuid,
  service_provider_name text,
  workshop_name text,
  inventory_id uuid,
  item_name text,
  sku text,
  oem_code text,
  item_type public.workshop_inventory_item_type,
  quantity numeric,
  minimum_quantity numeric,
  unit text,
  manufacturer text,
  vehicle_application text,
  storage_location text,
  notes text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select workshop.id, provider.id, provider.display_name, workshop.display_name,
    item.id, item.item_name, item.sku, item.oem_code, item.item_type,
    item.quantity, item.minimum_quantity, item.unit, item.manufacturer,
    item.vehicle_application, item.storage_location, item.notes, item.updated_at
  from public.workshops workshop
  join public.service_providers provider
    on provider.id = workshop.service_provider_id
    and provider.status = 'active'
  left join public.workshop_inventory_items item
    on item.workshop_id = workshop.id
  where workshop.status in ('pending', 'active')
    and private.can_manage_workshop_inventory(workshop.id)
  order by provider.display_name, workshop.display_name, item.item_name, item.sku
$$;

revoke all on function public.get_my_workshop_inventory()
  from public, anon;
grant execute on function public.get_my_workshop_inventory() to authenticated;

create function public.create_workshop_inventory_item(
  requested_workshop_id uuid,
  new_item_name text,
  new_sku text,
  new_oem_code text,
  new_item_type public.workshop_inventory_item_type,
  new_quantity numeric,
  new_minimum_quantity numeric,
  new_unit text,
  new_manufacturer text,
  new_vehicle_application text,
  new_storage_location text,
  new_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  manager_id uuid := private.current_inventory_manager_id();
  created_id uuid;
begin
  if manager_id is null
    or not private.can_manage_workshop_inventory(requested_workshop_id) then
    raise exception 'Inventory access denied' using errcode = '42501';
  end if;

  insert into public.workshop_inventory_items (
    workshop_id, item_name, sku, oem_code, item_type, quantity,
    minimum_quantity, unit, manufacturer, vehicle_application,
    storage_location, notes, updated_by_workshop_manager_id
  ) values (
    requested_workshop_id, btrim(new_item_name), upper(btrim(new_sku)),
    nullif(btrim(new_oem_code), ''), new_item_type, new_quantity,
    new_minimum_quantity, new_unit, nullif(btrim(new_manufacturer), ''),
    nullif(btrim(new_vehicle_application), ''),
    nullif(btrim(new_storage_location), ''), nullif(btrim(new_notes), ''),
    manager_id
  ) returning id into created_id;

  return created_id;
end;
$$;

revoke all on function public.create_workshop_inventory_item(
  uuid, text, text, text, public.workshop_inventory_item_type, numeric,
  numeric, text, text, text, text, text
) from public, anon;
grant execute on function public.create_workshop_inventory_item(
  uuid, text, text, text, public.workshop_inventory_item_type, numeric,
  numeric, text, text, text, text, text
) to authenticated;

create function public.update_workshop_inventory_item(
  requested_inventory_id uuid,
  new_item_name text,
  new_sku text,
  new_oem_code text,
  new_item_type public.workshop_inventory_item_type,
  new_quantity numeric,
  new_minimum_quantity numeric,
  new_unit text,
  new_manufacturer text,
  new_vehicle_application text,
  new_storage_location text,
  new_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inventory_row public.workshop_inventory_items%rowtype;
  manager_id uuid := private.current_inventory_manager_id();
begin
  select * into inventory_row
  from public.workshop_inventory_items item
  where item.id = requested_inventory_id
  for update;

  if inventory_row.id is null then
    raise exception 'Inventory item not found' using errcode = 'P0002';
  end if;
  if manager_id is null
    or not private.can_manage_workshop_inventory(inventory_row.workshop_id) then
    raise exception 'Inventory access denied' using errcode = '42501';
  end if;

  update public.workshop_inventory_items
  set item_name = btrim(new_item_name),
      sku = upper(btrim(new_sku)),
      oem_code = nullif(btrim(new_oem_code), ''),
      item_type = new_item_type,
      quantity = new_quantity,
      minimum_quantity = new_minimum_quantity,
      unit = new_unit,
      manufacturer = nullif(btrim(new_manufacturer), ''),
      vehicle_application = nullif(btrim(new_vehicle_application), ''),
      storage_location = nullif(btrim(new_storage_location), ''),
      notes = nullif(btrim(new_notes), ''),
      updated_by_workshop_manager_id = manager_id
  where id = requested_inventory_id;
end;
$$;

revoke all on function public.update_workshop_inventory_item(
  uuid, text, text, text, public.workshop_inventory_item_type, numeric,
  numeric, text, text, text, text, text
) from public, anon;
grant execute on function public.update_workshop_inventory_item(
  uuid, text, text, text, public.workshop_inventory_item_type, numeric,
  numeric, text, text, text, text, text
) to authenticated;

comment on table public.workshop_inventory_items is
  'Standalone, location-scoped lightweight stock list for workshop parts and consumables; intentionally independent from booking and repair workflows.';

commit;
