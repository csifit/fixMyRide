import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/202608060024_automotive_domain_expansion.sql", import.meta.url),
  "utf8",
);

test("the expand migration introduces canonical automotive identities", () => {
  assert.match(migration, /create type public\.platform_account_type as enum/i);
  for (const role of ["customer", "independent_service_provider", "workshop_manager", "workshop_staff"]) {
    assert.match(migration, new RegExp(`'${role}'`, "i"), role);
  }
  assert.match(migration, /add column target_account_type public\.platform_account_type/i);
  assert.match(migration, /account_identities_sync_target_account_type/i);
  assert.match(migration, /when 'clinic_manager' then 'workshop_manager'/i);
});

test("provider, workshop, and manager tables are additive and RLS protected", () => {
  for (const table of ["service_providers", "workshops", "workshop_manager_profiles", "workshop_manager_memberships"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`, "i"), table);
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"), table);
  }
  assert.match(migration, /revoke all on table public\.service_providers,[\s\S]+from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all)[^;]+(?:service_providers|workshops|workshop_manager_)[^;]+to authenticated/i);
});

test("legacy writes synchronize targets without cutting application reads over", () => {
  for (const trigger of [
    "clinics_sync_service_provider",
    "clinic_manager_profiles_sync_workshop_manager",
    "clinic_manager_memberships_sync_workshop_manager",
    "clinic_locations_refresh_automotive_workshops",
    "workshop_profiles_refresh_automotive_workshops",
  ]) assert.match(migration, new RegExp(`create trigger ${trigger}`, "i"), trigger);

  assert.match(migration, /insert into public\.service_providers[\s\S]+from public\.clinics clinic/i);
  assert.match(migration, /insert into public\.workshop_manager_profiles[\s\S]+from public\.clinic_manager_profiles manager/i);
  assert.match(migration, /insert into public\.workshop_manager_memberships[\s\S]+from public\.clinic_manager_memberships membership/i);
  assert.match(migration, /sync_service_provider_from_clinic[\s\S]+perform private\.refresh_automotive_workshops\(new\.id\)/i);
  assert.doesNotMatch(migration, /alter table public\.(?:clinics|clinic_locations|clinic_manager_profiles) rename/i);
  assert.doesNotMatch(migration, /drop (?:table|type|function)/i);
});

test("workshop consolidation is deterministic and preserves public identifiers", () => {
  assert.match(migration, /order by \(location\.status = 'active'\) desc, location\.created_at, location\.id/i);
  assert.match(migration, /legacy_clinic_location_id uuid unique/i);
  assert.match(migration, /legacy_workshop_profile_id uuid unique/i);
  assert.match(migration, /location_row\.id,[\s\S]+provider_row\.id/i);
  assert.match(migration, /profile_row\.id, provider_row\.id, profile_row\.id/i);
  assert.match(migration, /additional locations start with an empty catalogue|Active application tables never/i);
});
