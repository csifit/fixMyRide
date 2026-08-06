import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608060023_workshop_service_catalogue.sql");
const actions = await read("app/workshop-manager/services/actions.ts");
const client = await read("app/workshop-manager/services/ServiceCatalogueClient.tsx");
const portal = await read("app/workshop-manager/WorkshopManagerDashboard.tsx");
const english = JSON.parse(await read("app/i18n/en.json"));

test("catalogue RPCs authorize active workshop managers", () => {
  assert.match(migration, /create function private\.can_manage_workshop/i);
  assert.match(migration, /membership\.membership_role in \('owner', 'manager'\)/i);
  assert.match(migration, /manager\.auth_user_id = \(select auth\.uid\(\)\)/i);
  for (const rpc of ["get_my_workshop_service_catalogue", "create_managed_workshop_service", "update_managed_workshop_service", "set_managed_workshop_service_active"]) {
    assert.match(migration, new RegExp(`create function public\\.${rpc}`, "i"));
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}`, "i"));
  }
});

test("catalogue changes use validated server actions and preserve booking history", () => {
  assert.match(actions, /z\.object/);
  assert.match(actions, /priceFromCents: price/);
  assert.match(actions, /setManagedWorkshopServiceActive/);
  assert.doesNotMatch(actions, /deleteManagedWorkshopService/);
  assert.match(english["serviceCatalogue.description"], /Archived services remain attached to existing bookings/i);
  assert.match(english["serviceCatalogue.archiveAction"], /Archive service/);
  assert.match(actions, /status: parsed\.data\.active \? "published" : "archived"/);
});

test("workshop managers can reach and edit the catalogue", () => {
  assert.match(portal, /href="\/workshop-manager\/services"/);
  assert.equal(english["serviceCatalogue.title"], "Service catalogue");
  assert.match(client, /createServiceAction/);
  assert.match(client, /updateServiceAction/);
  assert.match(client, /useLanguage/);
});
