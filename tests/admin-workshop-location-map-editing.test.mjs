import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const addressSearch = await read("app/GoogleAddressSearch.tsx");
const forms = await read("app/admin/AdminWorkflowForms.tsx");
const actions = await read("app/admin/workflow-actions.ts");
const dal = await read("lib/dal/admin-organisations.ts");
const migration = await read("supabase/migrations/202608110049_admin_workshop_location_editing.sql");

test("administrator address entry defaults to search and offers a draggable manual pin", () => {
  assert.match(addressSearch, /useState<"search" \| "manual">\("search"\)/);
  assert.match(addressSearch, /gmpDraggable: !disabled/);
  assert.match(addressSearch, /map\.addListener\("click"/);
  assert.match(addressSearch, /marker\.addListener\("dragend"/);
  assert.match(addressSearch, /type="number" inputMode="decimal" min=\{-90\} max=\{90\}/);
  assert.match(addressSearch, /type="number" inputMode="decimal" min=\{-180\} max=\{180\}/);
  assert.match(addressSearch, /Coordinates remain authoritative when Google has no nearby address/);
  assert.match(forms, /allowManualPin manualPinLabels=\{locationPinLabels\(t\)\}/);
});

test("existing workshop locations can be selected and edited from the admin page", () => {
  assert.match(forms, /function LocationEditForm/);
  assert.match(forms, /setEditingWorkshopId\(workshop\.id\)/);
  assert.match(forms, /initialLatitude=\{workshop\.latitude\}/);
  assert.match(forms, /updateWorkshopLocationAction/);
  assert.match(actions, /updateAdminWorkshopLocation/);
  assert.match(dal, /rpc\("update_admin_workshop_location"/);
});

test("location editing is MFA-admin-only, audited, and preserves stable SEO slugs", () => {
  assert.match(migration, /create function public\.update_admin_workshop_location/);
  assert.match(migration, /private\.is_active_platform_admin\(\)/);
  assert.match(migration, /'location_updated'/);
  assert.match(migration, /insert into public\.platform_organisation_admin_history/);
  assert.doesNotMatch(
    migration.match(/create function public\.update_admin_workshop_location[\s\S]+?revoke all on function/)?.[0] ?? "",
    /set[\s\S]+slug\s*=/,
  );
  assert.match(migration, /without changing its stable public slug/);
});

test("admin workflow loads coordinates and contact details for owned and unowned locations", () => {
  assert.match(migration, /create function public\.get_admin_workshop_location_details/);
  assert.match(dal, /rpc\("get_admin_workshop_location_details"/);
  assert.match(dal, /latitude: location\?\.latitude == null \? null : Number/);
  assert.match(dal, /publicPhone: location\?\.public_phone \?\? null/);
});
