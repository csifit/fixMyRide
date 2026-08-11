import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608110050_admin_service_provider_management.sql");
const actions = await read("app/admin/workflow-actions.ts");
const forms = await read("app/admin/AdminWorkflowForms.tsx");
const dashboard = await read("app/admin/AdminDashboardClient.tsx");
const dal = await read("lib/dal/admin-organisations.ts");
const adminDal = await read("lib/dal/admin.ts");

test("provider management RPCs are MFA-admin-only and audit every mutation", () => {
  for (const name of [
    "get_admin_service_provider_details",
    "update_admin_service_provider",
    "assign_admin_workshop_service_provider",
    "set_admin_service_provider_status",
    "delete_admin_service_provider",
  ]) {
    assert.match(migration, new RegExp(`create(?: or replace)? function public\\.${name}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}`));
  }
  assert.match(migration, /private\.is_active_platform_admin\(\)/);
  assert.match(migration, /'organisation_updated'/);
  assert.match(migration, /'organisation_status_changed'/);
  assert.match(migration, /'location_coverage_assigned'/);
  assert.match(migration, /'organisation_deleted'/);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all) on table[^;]+authenticated/i);
});

test("provider status management extends the existing commercial-admin RPC", () => {
  assert.match(migration, /create or replace function public\.set_admin_service_provider_status\(\s*requested_provider_id uuid/);
  assert.match(migration, /insert into public\.service_provider_status_history/);
  assert.match(migration, /insert into public\.platform_organisation_admin_history/);
  assert.match(dal, /rpc\("set_admin_service_provider_status", \{\s*requested_provider_id: providerId,/);
});

test("company and invoicing details include separate tax, VAT, and registration fields", () => {
  assert.match(migration, /add column main_email text/);
  assert.match(migration, /add column vat_identifier text/);
  assert.match(migration, /add column registration_number text/);
  assert.match(forms, /name="mainEmail" type="email"/);
  assert.match(forms, /name="taxIdentifier"/);
  assert.match(forms, /name="vatIdentifier"/);
  assert.match(forms, /name="registrationNumber"/);
  assert.match(actions, /updateAdminServiceProvider/);
  assert.match(dal, /rpc\("update_admin_service_provider"/);
});

test("the compact provider table expands into editable organisation controls", () => {
  assert.match(dashboard, /<ProviderAdministration providers=\{data\.providers\}/);
  assert.match(forms, /<details className="admin-provider-accordion">/);
  assert.match(forms, /className="admin-provider-edit-form"/);
  assert.match(forms, /coveredLocations/);
  assert.match(forms, /assignServiceProviderLocationAction/);
  assert.match(forms, /setServiceProviderStatusAction/);
  assert.match(forms, /deleteServiceProviderOrganisationAction/);
});

test("location assignment cannot reassign another provider's workshop", () => {
  const assignment = migration.match(/create function public\.assign_admin_workshop_service_provider[\s\S]+?revoke all on function/)?.[0] ?? "";
  assert.match(assignment, /workshop\.service_provider_id is null/);
  assert.match(assignment, /workshop\.creation_source = 'administrator'/);
  assert.match(assignment, /using errcode = '23503'/);
});

test("delete is a guarded archive that retains financial and audit history", () => {
  const deletion = migration.match(/create function public\.delete_admin_service_provider[\s\S]+?comment on function/)?.[0] ?? "";
  assert.match(deletion, /requested_confirmation[\s\S]+provider_row\.display_name/);
  assert.match(deletion, /public\.workshops/);
  assert.match(deletion, /public\.workshop_manager_memberships/);
  assert.match(deletion, /public\.provider_invoices/);
  assert.match(deletion, /public\.service_provider_stripe_customers/);
  assert.match(deletion, /set status = 'rejected', deleted_at = now\(\)/);
  assert.doesNotMatch(deletion, /delete from public\.service_providers/i);
  assert.match(forms, /provider\.canDelete/);
  assert.match(adminDal, /activeProviderIds/);
});
