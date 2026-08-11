import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608110044_owner_workshop_location_management.sql");
const foundation = await read("supabase/migrations/202608100039_location_organisation_foundation.sql");
const page = await read("app/workshop-manager/workshops/page.tsx");
const actions = await read("app/workshop-manager/workshops/actions.ts");
const client = await read("app/workshop-manager/workshops/WorkshopOperationsClient.tsx");
const dal = await read("lib/dal/workshop-operations.ts");

test("only an active organisation owner can create a location", () => {
  assert.match(migration, /create function public\.create_my_workshop_location/);
  assert.match(migration, /private\.can_manage_service_organisation\(requested_service_provider_id\)/);
  assert.match(migration, /provider\.status = 'active'/);
  assert.match(migration, /membership\.membership_role = 'owner'/);
  assert.match(migration, /identity\.status = 'active'/);
  assert.match(migration, /grant execute on function public\.create_my_workshop_location[\s\S]+to authenticated/);
});

test("new locations require complete Google geocoding and safe defaults", () => {
  assert.match(migration, /requested_latitude is null or requested_latitude not between -90 and 90/);
  assert.match(migration, /requested_longitude is null or requested_longitude not between -180 and 180/);
  assert.match(migration, /insert into public\.workshops/);
  assert.match(migration, /btrim\(requested_display_name\)[\s\S]+'pending'/);
  assert.match(migration, /generate_series\(0, 6\)/);
  assert.match(foundation, /create trigger workshops_initialize_subscription/);
});

test("the creating owner receives exact-location onboarding access without satisfying publication", () => {
  assert.match(migration, /insert into public\.workshop_manager_assignments/);
  assert.match(migration, /values \(workshop_id, manager_id, 'manager', 'active'\)/);
  assert.doesNotMatch(migration, /values \(workshop_id, manager_id, 'primary_manager'/);
  assert.match(migration, /Publication remains[\s\S]+primary manager and billing coverage/);
});

test("the workshops page exposes owner-only creation and existing location management", () => {
  assert.match(page, /membershipRole === "owner"/);
  assert.match(page, /ownedProviders=\{ownedProviders\}/);
  assert.match(client, /function CreateLocationForm/);
  assert.match(client, /<GoogleAddressSearch/);
  assert.match(client, /workshopOperations\.assignPrimaryManager/);
  assert.match(client, /workshopOperations\.activateCoverage/);
  assert.match(actions, /createWorkshopLocationAction/);
  assert.match(actions, /coordinate = z\.string\(\)\.trim\(\)\.min\(1\)/);
  assert.match(actions, /revalidatePath\("\/workshop-manager\/invoicing"\)/);
  assert.match(dal, /rpc\("create_my_workshop_location"/);
});
