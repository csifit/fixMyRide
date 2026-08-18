import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608060023_workshop_service_catalogue.sql");
const actions = await read("app/workshop-manager/services/actions.ts");
const client = await read("app/workshop-manager/services/ServiceCatalogueClient.tsx");
const portal = await read("app/workshop-manager/WorkshopManagerDashboard.tsx");
const styles = await read("app/globals.css");
const home = await read("app/HomeDiscoveryClient.tsx");
const publicWorkshops = await read("lib/dal/public-workshops.ts");
const workshopDirectory = await read("app/workshops/page.tsx");
const serviceDiscoveryMigration = await read("supabase/migrations/202608180065_public_workshop_service_discovery.sql");
const electricVehicleMigration = await read("supabase/migrations/202608180066_electric_vehicle_service_catalogue.sql");
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

test("the add-service form lists services alphabetically with slightly larger text", () => {
  assert.match(client, /new Intl\.Collator\(locales\[language\]/);
  assert.match(client, /\.sort\(\(left, right\) => serviceNameCollator\.compare\(left\.name, right\.name\)\)/);
  assert.match(client, /className="settings-card catalogue-add-form"/);
  assert.match(styles, /\.catalogue-add-form \{ font-size:17px; \}/);
  assert.match(styles, /\.catalogue-add-form label \{ font-size:10px; \}/);
});

test("the public service browser uses the managed catalogue and recommends exact matching workshops", () => {
  assert.match(home, /standardServiceTemplates[\s\S]+service\.code !== "diagnosis"/);
  assert.doesNotMatch(home, /electricVehicleServiceCategories/);
  assert.match(home, /pathname: "\/workshops", query: \{ service: service\.code \}/);
  assert.match(home, /target="_blank" rel="noopener noreferrer"/);
  assert.match(home, /if \(selectedService\) return[\s\S]+service-results-only/);
  const focusedResults = home.match(/if \(selectedService\) return([\s\S]*?)return <main className="home-shell">/)?.[1] ?? "";
  assert.doesNotMatch(focusedResults, /automotive-hero|home-map-section|home-specialty-strip/);
  assert.match(focusedResults, /WorkshopGrid workshops=\{filtered\}/);
  assert.match(workshopDirectory, /searchPublicWorkshops\("", requestedServiceCode\)/);
  assert.match(publicWorkshops, /search_public_workshops_v3/);
  assert.match(serviceDiscoveryMigration, /matching_service\.active[\s\S]+matching_service\.service_code = btrim\(requested_service_code\)/i);
  assert.match(serviceDiscoveryMigration, /private\.is_workshop_discoverable\(workshop\.id\)/i);
  assert.match(electricVehicleMigration, /add value if not exists 'electric_vehicle'/i);
});
