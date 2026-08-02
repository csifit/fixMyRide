import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/202608020019_admin_patient_accounts.sql", root), "utf8");
const dashboard = await readFile(new URL("app/admin/AdminDashboardClient.tsx", root), "utf8");
const actions = await readFile(new URL("app/admin/actions.ts", root), "utf8");
const adminDal = await readFile(new URL("lib/dal/admin-patients.ts", root), "utf8");
const patientDal = await readFile(new URL("lib/dal/patient-appointments.ts", root), "utf8");
const patientFolder = await readFile(new URL("app/patient/page.tsx", root), "utf8");
const catalogs = Object.fromEntries(await Promise.all(["en", "de", "ro", "hu"].map(async (language) => [language, JSON.parse(await readFile(new URL(`app/i18n/${language}.json`, root), "utf8"))])));

test("Patient suspension and blocking are separate from permanent archival", () => {
  assert.match(migration, /create type public\.patient_account_status as enum\s*\('active', 'suspended', 'blocked'\)/i);
  assert.match(migration, /add column account_status public\.patient_account_status not null default 'active'/i);
  assert.match(migration, /if patient_archived_at is not null then[\s\S]+?cannot be reactivated here/i);
  assert.doesNotMatch(migration, /update public\.patients[\s\S]+?archived_at\s*=/i);
});

test("Admin Patient operations require the existing active AAL2 Admin identity", () => {
  const body = migration.match(/create function public\.update_admin_patient_account[\s\S]+?\$\$;/i)?.[0] ?? "";
  assert.match(body, /security definer/i);
  assert.match(body, /set search_path = ''/i);
  assert.match(body, /private\.current_platform_administrator_id\(\)/i);
  assert.match(body, /actor_id is null then raise insufficient_privilege/i);
  assert.match(migration, /revoke all on function public\.update_admin_patient_account/i);
});

test("Admin snapshot exposes account metadata but no medical profile or protected identifiers", () => {
  const snapshot = migration.match(/create function public\.get_admin_patient_operations_snapshot[\s\S]+?\$\$;/i)?.[0] ?? "";
  for (const field of ["vitapass_id", "email", "full_name", "account_phone", "preferred_language", "account_status", "last_sign_in_at"]) {
    assert.match(snapshot, new RegExp(`'${field}'`, "i"), field);
  }
  assert.doesNotMatch(snapshot, /date_of_birth|blood_group|rh_factor|insurance|cnp|health_card|diagnos|allerg|medication|surgery|implant|emergency_contact/i);
});

test("Patient-own read policies are replaced, not layered, and keep Doctor and Staff access independent", () => {
  for (const policy of ["patients_read_authorized", "allergies_read_authorized", "medications_read_authorized", "conditions_read_authorized", "surgeries_read_authorized", "implants_read_authorized", "contacts_read_authorized", "grants_read_participant"]) {
    assert.match(migration, new RegExp(`drop policy ${policy}`, "i"), policy);
    assert.match(migration, new RegExp(`create policy ${policy}`, "i"), policy);
  }
  assert.match(migration, /patient\.account_status = 'active'/i);
  assert.match(migration, /or public\.has_patient_access\(patient_id, false\)/i);
  assert.doesNotMatch(migration, /drop policy patients_staff_assigned_read|drop policy .*_staff_assigned_read/i);
});

test("Patient self-service uses one narrow identity RPC and active account helper", () => {
  const identity = migration.match(/create function public\.get_my_patient_account_identity[\s\S]+?\$\$;/i)?.[0] ?? "";
  assert.match(identity, /patient_id uuid,[\s\S]+?full_name text,[\s\S]+?account_status public\.patient_account_status,[\s\S]+?archived boolean/i);
  assert.doesNotMatch(identity, /date_of_birth|insurance|cnp|health_card|blood_group/i);
  assert.match(migration, /create or replace function private\.current_patient_id[\s\S]+?account_status = 'active'[\s\S]+?archived_at is null/i);
  assert.match(patientDal, /rpc\("get_my_patient_account_identity"\)/);
  assert.match(patientDal, /state: "suspended"/);
  assert.match(patientDal, /state: "blocked"/);
  assert.match(patientFolder, /access\.state !== "active"/);
});

test("Patient status history is protected, audited and never deleted", () => {
  assert.match(migration, /create table public\.patient_account_status_history/i);
  assert.match(migration, /alter table public\.patient_account_status_history enable row level security/i);
  assert.match(migration, /revoke all on table public\.patient_account_status_history[\s\S]+?public, anon, authenticated/i);
  assert.match(migration, /'patient_updated'[\s\S]+?'patient_account'/i);
  assert.match(migration, /"changed_fields":\["name","account_phone","preferred_language","account_status"\]/i);
  assert.doesNotMatch(migration, /delete from public\.(?:patients|patient_account_status_history)/i);
});

test("Admin Patient UI is accordion-based and never renders medical fields", () => {
  assert.match(dashboard, /<details className="admin-patient-row"/);
  assert.match(dashboard, /updateAdminPatientAccountAction/);
  assert.match(dashboard, /disabled=\{Boolean\(patient\.archivedAt\) \|\| pending\}/);
  assert.match(actions, /accountStatus: z\.enum\(\["active", "suspended", "blocked"\]\)/);
  assert.match(adminDal, /supabase\.rpc\("update_admin_patient_account"/);
  assert.doesNotMatch(dashboard, /dateOfBirth|bloodGroup|rhFactor|insurance|cnp|healthCard|diagnos|allerg|medication|surgery|implant/i);
  assert.doesNotMatch(`${dashboard}\n${actions}\n${adminDal}`, /deletePatient|removePatient/i);
});

test("Phase 4D Patient controls have translation parity", () => {
  const keys = [
    "admin.patient.status.active", "admin.patient.status.suspended", "admin.patient.status.blocked",
    "admin.patient.status.archived", "admin.patient.lastSignIn", "admin.patient.familyName",
    "admin.patient.phone", "admin.patient.language", "admin.patient.statusReason",
    "admin.patient.result.saved", "admin.patient.result.unavailable", "admin.patient.medicalPrivacyHelp",
    "patientAppointments.account.suspended", "patientAppointments.account.blocked", "patientAppointments.account.archived",
  ];
  for (const language of ["en", "de", "ro", "hu"]) {
    for (const key of keys) assert.equal(typeof catalogs[language][key], "string", `${language}: ${key}`);
  }
});
