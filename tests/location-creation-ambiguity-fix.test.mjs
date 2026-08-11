import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608110045_fix_location_creation_ambiguity.sql");
const adminDal = await read("lib/dal/admin-organisations.ts");
const ownerDal = await read("lib/dal/workshop-operations.ts");

test("admin and owner location RPCs use an unambiguous created workshop identifier", () => {
  assert.match(migration, /create or replace function public\.create_admin_workshop_location/);
  assert.match(migration, /create or replace function public\.create_my_workshop_location/);
  assert.equal((migration.match(/created_workshop_id uuid := gen_random_uuid\(\)/g) ?? []).length, 2);
  assert.equal((migration.match(/select created_workshop_id, day\.weekday/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /select workshop_id, day\.weekday/);
});

test("the corrected functions retain their original authorization boundaries", () => {
  assert.match(migration, /private\.is_active_platform_admin\(\)/);
  assert.match(migration, /private\.can_manage_service_organisation\(requested_service_provider_id\)/);
  assert.match(migration, /insert into public\.platform_organisation_admin_history/);
  assert.match(migration, /insert into public\.workshop_manager_assignments/);
});

test("location DALs record only safe database error codes for server diagnostics", () => {
  assert.match(adminDal, /console\.error\("create_admin_workshop_location", \{ code: error\.code \}\)/);
  assert.match(ownerDal, /console\.error\("create_my_workshop_location", \{ code: error\.code \}\)/);
  assert.doesNotMatch(adminDal, /console\.error\([^\n]+error\.message/);
  assert.doesNotMatch(ownerDal, /console\.error\([^\n]+error\.message/);
});
