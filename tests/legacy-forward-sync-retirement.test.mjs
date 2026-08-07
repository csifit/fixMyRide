import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL(
  "supabase/migrations/202608090038_retire_legacy_forward_sync.sql",
  root,
), "utf8");

test("sync retirement aborts when canonical structural mappings are incomplete", () => {
  for (const legacyTable of [
    "clinics",
    "clinic_manager_profiles",
    "clinic_manager_memberships",
    "workshop_profiles",
    "clinic_locations",
    "patients",
    "account_identities",
  ]) assert.ok(migration.includes(`public.${legacyTable}`), legacyTable);
  assert.match(migration, /Forward-sync retirement blocked/g);
  assert.match(migration, /legacy_sync_retirement_audits/);
  assert.match(migration, /legacyIdChecksum/);
  assert.match(migration, /canonicalIdChecksum/);
});

test("public registration writes canonical automotive records directly", () => {
  const registration = migration.match(
    /create or replace function private\.handle_public_account_registration\(\)[\s\S]+?comment on function private\.handle_public_account_registration\(\)/i,
  )?.[0] ?? "";
  for (const canonicalTable of [
    "customer_profiles",
    "workshop_manager_profiles",
    "service_providers",
    "workshop_manager_memberships",
    "workshops",
    "account_identities",
  ]) assert.ok(registration.includes(`public.${canonicalTable}`), canonicalTable);
  assert.doesNotMatch(registration, /public\.(clinics|clinic_manager_profiles|clinic_manager_memberships|billing_profiles)\b/);
  assert.match(registration, /target_account_type[\s\S]+?'workshop_manager'/);
});

test("all legacy-to-canonical forward triggers and functions are removed", () => {
  for (const trigger of [
    "patients_sync_customer_profile",
    "clinics_ensure_workshop_profile",
    "account_identities_sync_target_account_type",
    "clinics_sync_service_provider",
    "clinic_manager_profiles_sync_workshop_manager",
    "clinic_manager_memberships_sync_workshop_manager",
    "clinics_refresh_automotive_workshops",
    "clinic_locations_refresh_automotive_workshops",
    "workshop_profiles_refresh_automotive_workshops",
  ]) assert.match(migration, new RegExp(`drop trigger if exists ${trigger}`));
  assert.match(migration, /drop function private\.refresh_automotive_workshops\(uuid\)/);
  assert.match(migration, /account_identities_canonical_role_consistent/);
  assert.match(migration, /create function private\.reject_retired_legacy_mutation/);
  for (const table of [
    "patients",
    "clinics",
    "clinic_locations",
    "workshop_profiles",
    "clinic_manager_profiles",
    "clinic_manager_memberships",
  ]) assert.match(migration, new RegExp(`${table}_reject_post_cutover_mutation`));
});
