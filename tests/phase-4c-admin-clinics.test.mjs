import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/202608020018_admin_clinic_locations.sql", root), "utf8");
const dashboard = await readFile(new URL("app/admin/AdminDashboardClient.tsx", root), "utf8");
const actions = await readFile(new URL("app/admin/actions.ts", root), "utf8");
const dal = await readFile(new URL("lib/dal/admin-clinics.ts", root), "utf8");
const catalogs = Object.fromEntries(await Promise.all(["en", "de", "ro", "hu"].map(async (language) => [language, JSON.parse(await readFile(new URL(`app/i18n/${language}.json`, root), "utf8"))])));

test("physical locations and Doctor assignments are separate from clinic organizations and sponsorship", () => {
  assert.match(migration, /create table public\.clinic_locations/i);
  assert.match(migration, /clinic_id uuid not null references public\.clinics\(id\)/i);
  assert.match(migration, /create table public\.clinic_location_doctor_assignments/i);
  const assignmentTable = migration.match(/create table public\.clinic_location_doctor_assignments[\s\S]+?\n\);/i)?.[0] ?? "";
  assert.doesNotMatch(assignmentTable, /payer|billing|sponsor|subscription/i);
  assert.match(migration, /Payment sponsorship remains a separate relationship/i);
});

test("existing organizations and memberships are preserved through additive backfills", () => {
  assert.match(migration, /insert into public\.clinic_locations[\s\S]+?from public\.clinics clinic;/i);
  assert.match(migration, /insert into public\.clinic_location_doctor_assignments[\s\S]+?from public\.clinic_doctor_memberships membership/i);
  assert.doesNotMatch(migration, /drop table|truncate|delete from public\.(?:clinics|clinic_doctor_memberships|clinic_locations)/i);
});

test("Admin clinic operations use the existing simple AAL2 Admin authorization path", () => {
  assert.match(migration, /create function private\.current_platform_administrator_id\(\)[\s\S]+?administrator\.role::text in \('superadmin', 'admin'\)[\s\S]+?auth\.jwt\(\)->>'aal'\) = 'aal2'/i);
  for (const name of ["create_admin_clinic_location", "update_admin_clinic_location", "set_admin_doctor_location_assignment"]) {
    const body = migration.match(new RegExp(`create function public\\.${name}[\\s\\S]+?\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(body, /security definer/i, name);
    assert.match(body, /set search_path = ''/i, name);
    assert.match(body, /private\.current_platform_administrator_id\(\)/i, name);
    assert.match(body, /actor_id is null then raise insufficient_privilege/i, name);
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}`, "i"), name);
  }
});

test("new clinic tables have RLS and no direct browser grants", () => {
  for (const table of ["clinic_locations", "clinic_location_doctor_assignments", "clinic_location_status_history"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(migration, /revoke all on table public\.clinic_locations,[\s\S]+?from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /grant .* on (?:table )?public\.(?:clinic_locations|clinic_location_doctor_assignments|clinic_location_status_history)/i);
});

test("location lifecycle dates remain historical, audited and never hard-deleted", () => {
  assert.match(migration, /active_from date/);
  assert.match(migration, /ends_before date/);
  assert.match(migration, /create table public\.clinic_location_status_history/i);
  assert.match(migration, /'clinic_membership_updated',[\s\S]+?'clinic_location_doctor_assignments'/i);
  assert.match(migration, /"changed_fields":\["doctor","location","status","active_dates"\]/i);
  assert.doesNotMatch(migration, /delete from public\.(?:clinic_locations|clinic_location_doctor_assignments|clinic_location_status_history)/i);
});

test("public Doctor locations prefer active assignments while retaining legacy fallbacks", () => {
  for (const name of ["get_my_doctor_workspace", "search_public_doctors"]) {
    const body = migration.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]+?\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(body, /clinic_location_doctor_assignments/i, name);
    assert.match(body, /assigned_location\.status = 'active'/i, name);
    assert.match(body, /organization_location/i, name);
    assert.match(body, /clinician\.practice_address/i, name);
  }
  assert.match(migration, /sponsored\.clinic_id is null and location\.id is null/i);
});

test("Admin Clinics UI uses accordions and RPC-backed create, edit and assignment actions", () => {
  assert.match(dashboard, /<details className="admin-doctor-invite admin-clinic-create"/);
  assert.match(dashboard, /<details className="admin-clinic-row"/);
  assert.match(dashboard, /createAdminClinicLocationAction/);
  assert.match(dashboard, /updateAdminClinicLocationAction/);
  assert.match(dashboard, /setAdminDoctorLocationAssignmentAction/);
  assert.match(actions, /locationPair/);
  assert.match(dal, /supabase\.rpc\("create_admin_clinic_location"/);
  assert.match(dal, /supabase\.rpc\("set_admin_doctor_location_assignment"/);
  assert.doesNotMatch(dashboard, /name="(?:activeFrom|startsOn|endsBefore)"/);
  assert.doesNotMatch(actions, /formData\.get\("(?:activeFrom|startsOn|endsBefore)"\)/);
  assert.doesNotMatch(dal, /new_(?:active_from|starts_on|ends_before)/);
  assert.doesNotMatch(`${dashboard}\n${actions}\n${dal}`, /deleteClinic|removeClinic|deleteLocation/i);
});

test("Phase 4C clinic controls have translation parity", () => {
  const keys = [
    "admin.clinic.add.title", "admin.clinic.add.description", "admin.clinic.organization",
    "admin.clinic.locationName", "admin.clinic.assign.title", "admin.clinic.assign.description",
    "admin.clinic.assignedDoctors", "admin.clinic.statusHistory", "admin.clinic.assignment.invited",
    "admin.clinic.assignment.active", "admin.clinic.assignment.suspended", "admin.clinic.assignment.ended",
    "admin.clinic.result.created", "admin.clinic.result.saved", "admin.clinic.result.unavailable",
  ];
  for (const language of ["en", "de", "ro", "hu"]) {
    for (const key of keys) assert.equal(typeof catalogs[language][key], "string", `${language}: ${key}`);
  }
});
