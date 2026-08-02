import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/202608020020_continuous_platform_access.sql", root), "utf8");
const dashboard = await readFile(new URL("app/admin/AdminDashboardClient.tsx", root), "utf8");
const actions = await readFile(new URL("app/admin/actions.ts", root), "utf8");
const dal = await readFile(new URL("lib/dal/admin-clinics.ts", root), "utf8");

const functionBody = (name) => migration.match(
  new RegExp(`create or replace function ${name.replaceAll(".", "\\.")}\\([\\s\\S]+?\\$\\$;`, "i"),
)?.[0] ?? "";

test("Admin location and Doctor assignment forms have no relationship-date options", () => {
  assert.doesNotMatch(dashboard, /name="(?:activeFrom|startsOn|endsBefore)"/);
  assert.doesNotMatch(dashboard, /admin\.clinic\.(?:activeFrom|endsBefore)/);
  assert.doesNotMatch(actions, /formData\.get\("(?:activeFrom|startsOn|endsBefore)"\)/);
  assert.doesNotMatch(dal, /new_(?:active_from|starts_on|ends_before)/);
});

test("Staff platform access is status-based and ignores legacy assignment dates", () => {
  for (const name of [
    "private.can_manage_doctor_appointments",
    "private.staff_has_patient_access",
  ]) {
    const body = functionBody(name);
    assert.match(body, /assignment\.status = 'active'/, name);
    assert.doesNotMatch(body, /assignment\.(?:starts_on|ends_before)/, name);
  }
});

test("Doctor clinic and location access is status-based", () => {
  for (const name of ["public.get_my_doctor_workspace", "public.search_public_doctors"]) {
    const body = functionBody(name);
    assert.match(body, /membership\.status = 'active'/, name);
    assert.match(body, /assignment\.status = 'active'/, name);
    assert.match(body, /assigned_location\.status = 'active'/, name);
    assert.doesNotMatch(body, /(?:effective_from|effective_until|starts_on|ends_before|active_from)/, name);
  }
  const updateBody = functionBody("public.update_my_independent_workspace");
  assert.match(updateBody, /clinic_doctor_memberships/);
  assert.match(updateBody, /membership\.status = 'active'/);
  assert.doesNotMatch(updateBody, /(?:effective_from|effective_until)/);
});

test("browser roles can execute only date-free Admin location RPC overloads", () => {
  assert.match(migration, /create function public\.create_admin_clinic_location\([\s\S]+?new_status public\.organization_status,[\s\n]+request_correlation_id uuid/);
  assert.match(migration, /create function public\.set_admin_doctor_location_assignment\([\s\S]+?new_status public\.organization_membership_status,[\s\n]+request_correlation_id uuid/);
  assert.match(migration, /revoke all on function public\.set_admin_doctor_location_assignment\([\s\S]+?date, date, uuid[\s\S]+?from public, anon, authenticated/);
});

test("billing and payment state never gates platform access", () => {
  const accessFunctions = [
    "private.can_manage_doctor_appointments",
    "private.staff_has_patient_access",
    "public.get_my_doctor_workspace",
    "public.update_my_independent_workspace",
    "public.search_public_doctors",
  ].map(functionBody).join("\n");
  assert.doesNotMatch(accessFunctions, /billing_profiles|invoice|payment|unpaid|overdue/i);
  assert.match(migration, /Billing and payment state is accounting information only and must never gate platform access/);
});
