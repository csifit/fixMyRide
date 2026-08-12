import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const migration = await read("supabase/migrations/202608120054_lightweight_workshop_inventory.sql");
const client = await read("app/inventory/WorkshopInventoryClient.tsx");
const actions = await read("app/inventory/actions.ts");
const dal = await read("lib/dal/workshop-inventory.ts");
const navigation = await read("app/RoleWorkspaceShell.tsx");
const styles = await read("app/globals.css");

test("workshop inventory is standalone and location scoped", () => {
  assert.match(migration, /create table public\.workshop_inventory_items[\s\S]+workshop_id uuid not null references public\.workshops/i);
  const tableDefinition = migration.match(/create table public\.workshop_inventory_items[\s\S]+?\n\);/i)?.[0] ?? "";
  assert.doesNotMatch(tableDefinition, /booking|repair|estimate/i);
  assert.match(migration, /item_type public\.workshop_inventory_item_type/);
  assert.match(migration, /quantity numeric\(12, 2\)/i);
  assert.match(migration, /minimum_quantity numeric\(12, 2\)/i);
  assert.doesNotMatch(migration, /create function public\.(?:delete|consume|reserve|allocate)_workshop_inventory/i);
});

test("inventory access is RPC-only for assigned managers and organisation owners", () => {
  assert.match(migration, /alter table public\.workshop_inventory_items enable row level security/i);
  assert.match(migration, /revoke all on table public\.workshop_inventory_items from public, anon, authenticated/i);
  assert.match(migration, /private\.can_manage_automotive_workshop\(requested_workshop_id\)/i);
  assert.match(migration, /private\.can_manage_service_organisation\(provider\.id\)/i);
  assert.match(migration, /create function public\.get_my_workshop_inventory/i);
  assert.match(migration, /create function public\.create_workshop_inventory_item/i);
  assert.match(migration, /create function public\.update_workshop_inventory_item/i);
  assert.match(migration, /grant execute on function public\.get_my_workshop_inventory\(\) to authenticated/i);
  assert.match(dal, /supabase\.rpc\("get_my_workshop_inventory"\)/);
  assert.match(dal, /supabase\.rpc\("create_workshop_inventory_item"/);
  assert.match(dal, /supabase\.rpc\("update_workshop_inventory_item"/);
});

test("one-page inventory supports filters and add-edit row controls", () => {
  for (const field of ["itemName", "sku", "oemCode", "itemType", "quantity", "manufacturer", "vehicleApplication"]) {
    assert.match(client, new RegExp(`name="${field}"`));
  }
  assert.match(client, /setQuery\(/);
  assert.match(client, /setTypeFilter\(/);
  assert.match(client, /setStockFilter\(/);
  assert.match(client, /stockState\(item\)/);
  assert.match(client, /setEditing\("new"\)/);
  assert.match(client, /setEditing\(item\)/);
  assert.match(actions, /createInventoryItemAction/);
  assert.match(actions, /updateInventoryItemAction/);
  assert.match(styles, /\.inventory-title[^{]+\{[^}]+1\.618fr/i);
  assert.match(styles, /\.inventory-overview[^{]+\{[^}]+1\.618fr/i);
});

test("both workshop roles can reach their inventory page", async () => {
  assert.match(navigation, /href: "\/workshop-manager\/inventory"/);
  assert.match(navigation, /href: "\/service-organisation\/inventory"/);
  const [managerPage, ownerPage] = await Promise.all([
    read("app/workshop-manager/inventory/page.tsx"),
    read("app/service-organisation/inventory/page.tsx"),
  ]);
  assert.match(managerPage, /getWorkshopManagerAccess/);
  assert.match(ownerPage, /getServiceOrganisationAccess/);
  assert.match(managerPage, /loadMyWorkshopInventory/);
  assert.match(ownerPage, /loadMyWorkshopInventory/);
});
