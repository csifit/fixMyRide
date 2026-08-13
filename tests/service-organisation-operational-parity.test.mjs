import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const migration = await read("supabase/migrations/202608130059_service_organisation_operational_access.sql");
const navigation = await read("app/RoleWorkspaceShell.tsx");
const dashboard = await read("app/service-organisation/ServiceOrganisationDashboard.tsx");
const requestActions = await read("app/workshop-manager/requests/actions.ts");
const repairActions = await read("app/workshop-manager/repairs/actions.ts");
const qualityActions = await read("app/workshop-manager/quality/actions.ts");
const serviceActions = await read("app/workshop-manager/services/actions.ts");
const workspaceLink = await read("app/WorkspaceLink.tsx");

const nativePages = Object.fromEntries(await Promise.all(
  ["requests", "repairs", "quality", "services"].map(async (section) => [
    section, await read(`app/service-organisation/${section}/page.tsx`),
  ]),
));
const managerPages = Object.fromEntries(await Promise.all(
  ["requests", "repairs", "quality", "services", "workshops", "inventory"].map(async (section) => [
    section, await read(`app/workshop-manager/${section}/page.tsx`),
  ]),
));

test("organisation owners operate every owned workshop while managers still require an assignment", () => {
  assert.match(migration, /membership\.membership_role in \('owner', 'manager'\)/);
  assert.match(migration, /left join public\.workshop_manager_assignments assignment/);
  assert.match(migration, /membership\.membership_role = 'owner'[\s\S]+membership\.membership_role = 'manager'[\s\S]+assignment\.id is not null/);
  assert.match(migration, /membership\.service_provider_id = workshop\.service_provider_id/);
  assert.match(migration, /manager\.auth_user_id = \(select auth\.uid\(\)\)/);
});

test("Service Organisation has native operational pages protected by owner access", () => {
  const expectedLoaders = {
    requests: ["loadManagedWorkshopBookings", "loadManagedWorkshopCatalogues", "loadWorkshopScheduling"],
    repairs: ["loadManagedRepairWorkflows"],
    quality: ["loadManagedQualityWorkspace"],
    services: ["loadManagedWorkshopCatalogues"],
  };
  for (const [section, source] of Object.entries(nativePages)) {
    assert.match(source, /getServiceOrganisationAccess/);
    assert.match(source, /redirect\("\/service-organisation\/login"\)/);
    for (const loader of expectedLoaders[section]) assert.match(source, new RegExp(loader));
    assert.match(navigation, new RegExp(`/service-organisation/${section}`));
    assert.match(dashboard, new RegExp(`/service-organisation/${section}`));
  }
});

test("owners entering Workshop Manager operational URLs return to their native workspace", () => {
  const destinations = {
    requests: "requests", repairs: "repairs", quality: "quality",
    services: "services", workshops: "locations", inventory: "inventory",
  };
  for (const [section, destination] of Object.entries(destinations)) {
    assert.match(managerPages[section], /getServiceOrganisationAccess/);
    assert.match(managerPages[section], new RegExp(`redirect\\(\"/service-organisation/${destination}\"\\)`));
  }
});

test("shared operational mutations refresh both portal routes", () => {
  assert.match(requestActions, /revalidatePath\("\/service-organisation\/requests"\)/);
  assert.match(repairActions, /revalidatePath\("\/service-organisation\/repairs"\)/);
  assert.match(qualityActions, /revalidatePath\("\/service-organisation\/quality"\)/);
  assert.match(serviceActions, /revalidatePath\("\/service-organisation\/services"\)/);
});

test("shared clients keep Service Organisation users inside their native portal", () => {
  assert.match(workspaceLink, /pathname\.startsWith\("\/service-organisation"\)/);
  for (const [managerRoute, organisationRoute] of [
    ["requests", "requests"], ["repairs", "repairs"], ["quality", "quality"],
    ["workshops", "locations"], ["services", "services"], ["inventory", "inventory"],
  ]) {
    assert.match(workspaceLink, new RegExp(`\"/workshop-manager/${managerRoute}\": \"/service-organisation/${organisationRoute}\"`));
  }
});
