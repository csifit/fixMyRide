import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/202608020016_admin_attention_console.sql", root), "utf8");
const dashboard = await readFile(new URL("app/admin/AdminDashboardClient.tsx", root), "utf8");
const dal = await readFile(new URL("lib/dal/admin.ts", root), "utf8");
const authz = await readFile(new URL("lib/authz.ts", root), "utf8");
const catalogs = Object.fromEntries(await Promise.all(["en", "de", "ro", "hu"].map(async (language) => [language, JSON.parse(await readFile(new URL(`app/i18n/${language}.json`, root), "utf8"))])));

test("Platform Admin console requires an active linked AAL2 account", () => {
  const helper = migration.match(/create function private\.is_active_platform_admin\(\)[\s\S]+?\$\$;/i)?.[0] ?? "";
  assert.match(helper, /security definer/i);
  assert.match(helper, /set search_path = ''/i);
  assert.match(helper, /auth\.jwt\(\)->>'aal'\) = 'aal2'/i);
  assert.match(helper, /role::text in \('superadmin', 'admin'\)/i);
  assert.match(helper, /administrator\.status = 'active'/i);
  assert.match(authz, /input\.role !== "superadmin" && input\.role !== "admin"/);
});

test("operations snapshot is a narrow read-only RPC", () => {
  assert.match(migration, /create function public\.get_admin_operations_snapshot\(\)[\s\S]+?stable[\s\S]+?security definer/i);
  assert.match(migration, /revoke all on function public\.get_admin_operations_snapshot\(\)[\s\S]+?public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.get_admin_operations_snapshot\(\)[\s\S]+?authenticated/i);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete) on (?:table )?public\./i);
  assert.match(dal, /rpc\("get_admin_operations_snapshot"\)/);
  assert.doesNotMatch(dal, /\.from\(/);
});

test("snapshot excludes medical records, identifiers, grants and audit contents", () => {
  for (const forbidden of [
    "patient_sensitive_identifiers", "allergies", "medications", "chronic_conditions",
    "surgeries", "implants_and_devices", "emergency_contacts", "patient_access_grants", "audit_events",
    "date_of_birth", "blood_group", "cnp", "health_card_number",
  ]) assert.equal(migration.toLowerCase().includes(forbidden), false, forbidden);
});

test("attention is the default and obsolete routine navigation is removed", () => {
  assert.match(dashboard, /section = "attention"/);
  assert.match(dashboard, /href: "\/admin\/doctors"/);
  assert.match(dashboard, /href: "\/admin\/privacy"/);
  assert.doesNotMatch(dashboard, /admin\.nav\.(?:grants|audit)/);
  assert.match(dashboard, /brand\.name/);
  assert.doesNotMatch(dashboard, />VitaPass</);
});

test("new Admin destinations have translation parity", () => {
  const keys = [
    "admin.nav.attention", "admin.nav.clinics", "admin.nav.organizations", "admin.nav.managers",
    "admin.nav.specialties", "admin.nav.reviews", "admin.nav.sms", "admin.nav.contracts",
    "admin.nav.privacy", "admin.nav.security", "admin.section.attention.title",
    "admin.attention.empty", "admin.task.doctor_approval", "admin.task.clinic_approval",
    "admin.task.clinic_manager_approval", "admin.task.billing_profile",
  ];
  for (const language of ["en", "de", "ro", "hu"]) {
    for (const key of keys) assert.equal(typeof catalogs[language][key], "string", `${language}: ${key}`);
  }
});
