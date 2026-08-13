begin;

create type public.workshop_inventory_movement_type as enum
  ('received', 'used', 'corrected', 'returned');

alter table public.workshop_inventory_items
  add column supplier text
    check (supplier is null or char_length(btrim(supplier)) between 1 and 160),
  add column purchase_price_cents bigint
    check (purchase_price_cents is null or purchase_price_cents between 0 and 100000000000),
  add column selling_price_cents bigint
    check (selling_price_cents is null or selling_price_cents between 0 and 100000000000),
  add column currency char(3) not null default 'EUR'
    check (currency = upper(currency));

create table public.workshop_inventory_stock_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.workshop_inventory_items(id) on delete restrict,
  workshop_id uuid not null references public.workshops(id) on delete restrict,
  movement_type public.workshop_inventory_movement_type not null,
  quantity_change numeric(12, 2) not null,
  previous_quantity numeric(12, 2) not null check (previous_quantity >= 0),
  new_quantity numeric(12, 2) not null check (new_quantity >= 0),
  reason text check (reason is null or char_length(btrim(reason)) between 1 and 240),
  reference text check (reference is null or char_length(btrim(reference)) between 1 and 120),
  changed_by_auth_user_id uuid not null,
  created_at timestamptz not null default now(),
  check (new_quantity = previous_quantity + quantity_change)
);

create index workshop_inventory_movements_item_time_idx
  on public.workshop_inventory_stock_movements(inventory_id, created_at desc);
create index workshop_inventory_movements_workshop_time_idx
  on public.workshop_inventory_stock_movements(workshop_id, created_at desc);

alter table public.workshop_inventory_stock_movements enable row level security;
revoke all on table public.workshop_inventory_stock_movements
  from public, anon, authenticated;

insert into public.workshop_inventory_stock_movements (
  inventory_id, workshop_id, movement_type, quantity_change,
  previous_quantity, new_quantity, reason, changed_by_auth_user_id, created_at
)
select item.id, item.workshop_id, 'corrected', item.quantity,
  0, item.quantity, 'Opening balance', manager.auth_user_id, item.created_at
from public.workshop_inventory_items item
join public.workshop_manager_profiles manager
  on manager.id = item.updated_by_workshop_manager_id;

create function public.get_my_workshop_inventory_v2()
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
  supplier text,
  purchase_price_cents bigint,
  selling_price_cents bigint,
  currency text,
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
    item.vehicle_application, item.supplier, item.purchase_price_cents,
    item.selling_price_cents, item.currency::text, item.storage_location,
    item.notes, item.updated_at
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

revoke all on function public.get_my_workshop_inventory_v2() from public, anon;
grant execute on function public.get_my_workshop_inventory_v2() to authenticated;

create function public.get_my_workshop_inventory_movements(
  requested_workshop_id uuid,
  requested_inventory_id uuid default null,
  requested_limit integer default 200
)
returns table (
  movement_id uuid,
  inventory_id uuid,
  item_name text,
  sku text,
  movement_type public.workshop_inventory_movement_type,
  quantity_change numeric,
  previous_quantity numeric,
  new_quantity numeric,
  unit text,
  reason text,
  reference text,
  actor_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_workshop_inventory(requested_workshop_id) then
    raise exception 'Inventory access denied' using errcode = '42501';
  end if;
  return query
  select movement.id, item.id, item.item_name, item.sku, movement.movement_type,
    movement.quantity_change, movement.previous_quantity, movement.new_quantity,
    item.unit, movement.reason, movement.reference,
    coalesce(manager.display_name, 'Workshop team member'), movement.created_at
  from public.workshop_inventory_stock_movements movement
  join public.workshop_inventory_items item on item.id = movement.inventory_id
  left join public.workshop_manager_profiles manager
    on manager.auth_user_id = movement.changed_by_auth_user_id
  where movement.workshop_id = requested_workshop_id
    and (requested_inventory_id is null or item.id = requested_inventory_id)
  order by movement.created_at desc
  limit least(greatest(coalesce(requested_limit, 200), 1), 500);
end;
$$;

revoke all on function public.get_my_workshop_inventory_movements(uuid, uuid, integer)
  from public, anon;
grant execute on function public.get_my_workshop_inventory_movements(uuid, uuid, integer)
  to authenticated;

create function public.create_workshop_inventory_item_v2(
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
  new_supplier text,
  new_purchase_price_cents bigint,
  new_selling_price_cents bigint,
  new_currency text,
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
    minimum_quantity, unit, manufacturer, vehicle_application, supplier,
    purchase_price_cents, selling_price_cents, currency, storage_location,
    notes, updated_by_workshop_manager_id
  ) values (
    requested_workshop_id, btrim(new_item_name), upper(btrim(new_sku)),
    nullif(btrim(new_oem_code), ''), new_item_type, new_quantity,
    new_minimum_quantity, new_unit, nullif(btrim(new_manufacturer), ''),
    nullif(btrim(new_vehicle_application), ''), nullif(btrim(new_supplier), ''),
    new_purchase_price_cents, new_selling_price_cents, upper(new_currency),
    nullif(btrim(new_storage_location), ''), nullif(btrim(new_notes), ''),
    manager_id
  ) returning id into created_id;
  insert into public.workshop_inventory_stock_movements (
    inventory_id, workshop_id, movement_type, quantity_change,
    previous_quantity, new_quantity, reason, changed_by_auth_user_id
  ) values (
    created_id, requested_workshop_id, 'corrected', new_quantity,
    0, new_quantity, 'Opening balance', (select auth.uid())
  );
  return created_id;
end;
$$;

revoke all on function public.create_workshop_inventory_item_v2(
  uuid, text, text, text, public.workshop_inventory_item_type, numeric,
  numeric, text, text, text, text, bigint, bigint, text, text, text
) from public, anon;
grant execute on function public.create_workshop_inventory_item_v2(
  uuid, text, text, text, public.workshop_inventory_item_type, numeric,
  numeric, text, text, text, text, bigint, bigint, text, text, text
) to authenticated;

create function public.update_workshop_inventory_item_v2(
  requested_inventory_id uuid,
  new_item_name text,
  new_sku text,
  new_oem_code text,
  new_item_type public.workshop_inventory_item_type,
  new_minimum_quantity numeric,
  new_unit text,
  new_manufacturer text,
  new_vehicle_application text,
  new_supplier text,
  new_purchase_price_cents bigint,
  new_selling_price_cents bigint,
  new_currency text,
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
  select * into inventory_row from public.workshop_inventory_items item
  where item.id = requested_inventory_id for update;
  if inventory_row.id is null then
    raise exception 'Inventory item not found' using errcode = 'P0002';
  end if;
  if manager_id is null
    or not private.can_manage_workshop_inventory(inventory_row.workshop_id) then
    raise exception 'Inventory access denied' using errcode = '42501';
  end if;
  update public.workshop_inventory_items set
    item_name = btrim(new_item_name), sku = upper(btrim(new_sku)),
    oem_code = nullif(btrim(new_oem_code), ''), item_type = new_item_type,
    minimum_quantity = new_minimum_quantity, unit = new_unit,
    manufacturer = nullif(btrim(new_manufacturer), ''),
    vehicle_application = nullif(btrim(new_vehicle_application), ''),
    supplier = nullif(btrim(new_supplier), ''),
    purchase_price_cents = new_purchase_price_cents,
    selling_price_cents = new_selling_price_cents,
    currency = upper(new_currency),
    storage_location = nullif(btrim(new_storage_location), ''),
    notes = nullif(btrim(new_notes), ''), updated_by_workshop_manager_id = manager_id
  where id = requested_inventory_id;
end;
$$;

revoke all on function public.update_workshop_inventory_item_v2(
  uuid, text, text, text, public.workshop_inventory_item_type, numeric,
  text, text, text, text, bigint, bigint, text, text, text
) from public, anon;
grant execute on function public.update_workshop_inventory_item_v2(
  uuid, text, text, text, public.workshop_inventory_item_type, numeric,
  text, text, text, text, bigint, bigint, text, text, text
) to authenticated;

create function public.adjust_workshop_inventory_stock(
  requested_inventory_id uuid,
  requested_movement_type public.workshop_inventory_movement_type,
  requested_quantity numeric,
  requested_reason text,
  requested_reference text
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  inventory_row public.workshop_inventory_items%rowtype;
  manager_id uuid := private.current_inventory_manager_id();
  resulting_quantity numeric;
  quantity_delta numeric;
begin
  select * into inventory_row from public.workshop_inventory_items item
  where item.id = requested_inventory_id for update;
  if inventory_row.id is null then
    raise exception 'Inventory item not found' using errcode = 'P0002';
  end if;
  if manager_id is null
    or not private.can_manage_workshop_inventory(inventory_row.workshop_id) then
    raise exception 'Inventory access denied' using errcode = '42501';
  end if;
  if requested_quantity is null or requested_quantity < 0
    or requested_quantity > 100000000
    or (requested_movement_type <> 'corrected' and requested_quantity = 0) then
    raise exception 'Invalid stock quantity' using errcode = '22023';
  end if;
  if requested_movement_type = 'corrected' then
    resulting_quantity := requested_quantity;
    quantity_delta := requested_quantity - inventory_row.quantity;
  elsif requested_movement_type in ('received', 'returned') then
    quantity_delta := requested_quantity;
    resulting_quantity := inventory_row.quantity + requested_quantity;
  else
    quantity_delta := -requested_quantity;
    resulting_quantity := inventory_row.quantity - requested_quantity;
  end if;
  if resulting_quantity < 0 or resulting_quantity > 100000000 then
    raise exception 'Stock quantity is outside the allowed range' using errcode = '22023';
  end if;
  update public.workshop_inventory_items set quantity = resulting_quantity,
    updated_by_workshop_manager_id = manager_id where id = inventory_row.id;
  insert into public.workshop_inventory_stock_movements (
    inventory_id, workshop_id, movement_type, quantity_change,
    previous_quantity, new_quantity, reason, reference, changed_by_auth_user_id
  ) values (
    inventory_row.id, inventory_row.workshop_id, requested_movement_type,
    quantity_delta, inventory_row.quantity, resulting_quantity,
    nullif(btrim(requested_reason), ''), nullif(btrim(requested_reference), ''),
    (select auth.uid())
  );
  return resulting_quantity;
end;
$$;

revoke all on function public.adjust_workshop_inventory_stock(
  uuid, public.workshop_inventory_movement_type, numeric, text, text
) from public, anon;
grant execute on function public.adjust_workshop_inventory_stock(
  uuid, public.workshop_inventory_movement_type, numeric, text, text
) to authenticated;

create function public.import_workshop_inventory_items(
  requested_workshop_id uuid,
  requested_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  manager_id uuid := private.current_inventory_manager_id();
  imported_count integer := 0;
  value jsonb;
  inventory_row public.workshop_inventory_items%rowtype;
  imported_quantity numeric;
begin
  if manager_id is null
    or not private.can_manage_workshop_inventory(requested_workshop_id) then
    raise exception 'Inventory access denied' using errcode = '42501';
  end if;
  if requested_items is null or jsonb_typeof(requested_items) <> 'array'
    or jsonb_array_length(requested_items) > 500 then
    raise exception 'Invalid inventory import' using errcode = '22023';
  end if;
  for value in select * from jsonb_array_elements(requested_items)
  loop
    imported_quantity := (value->>'quantity')::numeric;
    select * into inventory_row from public.workshop_inventory_items item
    where item.workshop_id = requested_workshop_id
      and lower(item.sku) = lower(value->>'sku') for update;
    if inventory_row.id is null then
      insert into public.workshop_inventory_items (
        workshop_id, item_name, sku, oem_code, item_type, quantity,
        minimum_quantity, unit, manufacturer, vehicle_application, supplier,
        purchase_price_cents, selling_price_cents, currency, storage_location,
        notes, updated_by_workshop_manager_id
      ) values (
        requested_workshop_id, btrim(value->>'itemName'), upper(btrim(value->>'sku')),
        nullif(btrim(value->>'oemCode'), ''), (value->>'itemType')::public.workshop_inventory_item_type,
        imported_quantity, (value->>'minimumQuantity')::numeric, value->>'unit',
        nullif(btrim(value->>'manufacturer'), ''), nullif(btrim(value->>'vehicleApplication'), ''),
        nullif(btrim(value->>'supplier'), ''), (value->>'purchasePriceCents')::bigint,
        (value->>'sellingPriceCents')::bigint, upper(value->>'currency'),
        nullif(btrim(value->>'storageLocation'), ''), nullif(btrim(value->>'notes'), ''), manager_id
      ) returning * into inventory_row;
      insert into public.workshop_inventory_stock_movements (
        inventory_id, workshop_id, movement_type, quantity_change,
        previous_quantity, new_quantity, reason, changed_by_auth_user_id
      ) values (inventory_row.id, requested_workshop_id, 'corrected', imported_quantity,
        0, imported_quantity, 'CSV import', (select auth.uid()));
    else
      update public.workshop_inventory_items set
        item_name = btrim(value->>'itemName'), oem_code = nullif(btrim(value->>'oemCode'), ''),
        item_type = (value->>'itemType')::public.workshop_inventory_item_type,
        quantity = imported_quantity, minimum_quantity = (value->>'minimumQuantity')::numeric,
        unit = value->>'unit', manufacturer = nullif(btrim(value->>'manufacturer'), ''),
        vehicle_application = nullif(btrim(value->>'vehicleApplication'), ''),
        supplier = nullif(btrim(value->>'supplier'), ''),
        purchase_price_cents = (value->>'purchasePriceCents')::bigint,
        selling_price_cents = (value->>'sellingPriceCents')::bigint,
        currency = upper(value->>'currency'), storage_location = nullif(btrim(value->>'storageLocation'), ''),
        notes = nullif(btrim(value->>'notes'), ''), updated_by_workshop_manager_id = manager_id
      where id = inventory_row.id;
      if imported_quantity is distinct from inventory_row.quantity then
        insert into public.workshop_inventory_stock_movements (
          inventory_id, workshop_id, movement_type, quantity_change,
          previous_quantity, new_quantity, reason, changed_by_auth_user_id
        ) values (inventory_row.id, requested_workshop_id, 'corrected',
          imported_quantity - inventory_row.quantity, inventory_row.quantity,
          imported_quantity, 'CSV import', (select auth.uid()));
      end if;
    end if;
    imported_count := imported_count + 1;
    inventory_row := null;
  end loop;
  return imported_count;
end;
$$;

revoke all on function public.import_workshop_inventory_items(uuid, jsonb)
  from public, anon;
grant execute on function public.import_workshop_inventory_items(uuid, jsonb)
  to authenticated;

comment on table public.workshop_inventory_stock_movements is
  'Immutable, RPC-managed stock change history for the standalone workshop inventory.';

commit;
