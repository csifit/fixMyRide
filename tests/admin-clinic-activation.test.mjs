import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/202608030021_admin_location_activates_organization.sql", import.meta.url),
  "utf8",
);

test("activating an Admin-managed location also activates its clinic organization", () => {
  assert.match(migration, /create or replace function public\.create_admin_clinic_location[\s\S]*?if new_status = 'active' then[\s\S]*?update public\.clinics as clinic[\s\S]*?set status = 'active'/i);
  assert.match(migration, /create or replace function public\.update_admin_clinic_location[\s\S]*?if new_status = 'active' then[\s\S]*?update public\.clinics as clinic[\s\S]*?set status = 'active'/i);
});

test("location approval remains restricted to authenticated platform administrators", () => {
  const administratorChecks = migration.match(/private\.current_platform_administrator_id\(\)/g) ?? [];
  assert.equal(administratorChecks.length, 2);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /revoke all on function public\.create_admin_clinic_location[\s\S]*?from public, anon/i);
  assert.match(migration, /grant execute on function public\.create_admin_clinic_location[\s\S]*?to authenticated/i);
});
