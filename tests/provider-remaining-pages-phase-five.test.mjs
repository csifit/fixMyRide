import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [migration, settings, actions, repairs, repairForm, quality, managers, billing, navigation, en, de, ro, hu] = await Promise.all([
  read("supabase/migrations/202608190069_customer_invoicing_preferences.sql"),
  read("app/customer-invoicing/CustomerInvoicingSettingsClient.tsx"),
  read("app/customer-invoicing/actions.ts"),
  read("app/workshop-manager/repairs/WorkshopRepairsClient.tsx"),
  read("app/workshop-manager/repairs/VehicleServiceRecordForm.tsx"),
  read("app/workshop-manager/quality/WorkshopQualityClient.tsx"),
  read("app/workshop-manager/organisation/OrganisationCoverageClient.tsx"),
  read("app/workshop-manager/invoicing/ProviderBillingClient.tsx"),
  read("app/RoleWorkspaceShell.tsx"),
  read("app/i18n/en.json"), read("app/i18n/de.json"), read("app/i18n/ro.json"), read("app/i18n/hu.json"),
]);

test("customer invoicing uses an organisation default with nullable workshop overrides", () => {
  assert.match(migration, /service_providers[\s\S]*customer_invoicing_enabled boolean not null default true/);
  assert.match(migration, /workshops[\s\S]*customer_invoicing_enabled boolean/);
  assert.match(migration, /coalesce\(workshop\.customer_invoicing_enabled, provider\.customer_invoicing_enabled\)/);
  assert.match(migration, /private\.can_manage_service_organisation\(requested_provider_id\)/);
  assert.match(migration, /private\.can_manage_automotive_workshop\(requested_workshop_id\)/);
});

test("disabled customer invoicing is enforced in the database while historical values are retained", () => {
  assert.match(migration, /vehicle_service_records_customer_invoicing_preference/);
  assert.match(migration, /if invoicing_enabled is false/);
  assert.match(migration, /new\.invoice_number := old\.invoice_number/);
  assert.match(migration, /new\.invoice_total_cents := old\.invoice_total_cents/);
  assert.match(repairForm, /repair\.customerInvoicingEnabled \?/);
  assert.match(repairForm, /customerInvoicing\.disabledForWorkshop/);
});

test("organisation owners and workshop managers receive scoped customer invoicing controls", () => {
  assert.match(settings, /mode: "organisation" \| "workshop"/);
  assert.match(settings, /providerDefaultEnabled/);
  assert.match(settings, /workshopOverrideEnabled/);
  assert.match(actions, /updateProviderCustomerInvoicingPreference/);
  assert.match(actions, /updateWorkshopCustomerInvoicingPreference/);
  assert.match(navigation, /\/workshop-manager\/invoicing/);
  assert.match(navigation, /\/service-organisation\/settings/);
});

test("remaining operational pages include introductions, field help and useful empty states", () => {
  for (const source of [repairs, quality, managers, billing, settings]) {
    assert.match(source, /OperationalIntroduction/);
  }
  for (const source of [repairs, quality, managers, billing, settings]) {
    assert.match(source, /OperationalEmptyState/);
  }
  for (const source of [repairs, quality, managers, billing, settings]) {
    assert.match(source, /FieldHelp/);
  }
});

test("Phase 5 translation keys remain identical in all supported dictionaries", () => {
  const dictionaries = [en, de, ro, hu].map(JSON.parse);
  const expected = Object.keys(dictionaries[0]).filter((key) => key.startsWith("phase5.") || key.startsWith("customerInvoicing."));
  assert.ok(expected.length >= 60);
  for (const dictionary of dictionaries.slice(1)) {
    assert.deepEqual(
      Object.keys(dictionary).filter((key) => key.startsWith("phase5.") || key.startsWith("customerInvoicing.")),
      expected,
    );
  }
});
