import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/202608020017_admin_doctor_operations.sql", root), "utf8");
const dashboard = await readFile(new URL("app/admin/AdminDashboardClient.tsx", root), "utf8");
const actions = await readFile(new URL("app/admin/actions.ts", root), "utf8");
const registration = await readFile(new URL("app/register/RegistrationForm.tsx", root), "utf8");
const email = await readFile(new URL("lib/email/invitation.ts", root), "utf8");
const catalogs = Object.fromEntries(await Promise.all(["en", "de", "ro", "hu"].map(async (language) => [language, JSON.parse(await readFile(new URL(`app/i18n/${language}.json`, root), "utf8"))])));

test("Platform Doctor invitation enum is committed before it is used", () => {
  const enumPosition = migration.indexOf("add value if not exists 'platform_doctor'");
  const firstCommit = migration.indexOf("commit;", enumPosition);
  const firstUse = migration.indexOf("invitation_kind = 'platform_doctor'", enumPosition);
  assert.ok(enumPosition >= 0 && firstCommit > enumPosition && firstUse > firstCommit);
});

test("Admin Doctor operations require active AAL2 Platform Admin authorization", () => {
  for (const name of ["create_platform_doctor_invitation", "update_admin_doctor"]) {
    const body = migration.match(new RegExp(`create function public\\.${name}[\\s\\S]+?\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(body, /security definer/i, name);
    assert.match(body, /set search_path = ''/i, name);
    assert.match(body, /private\.is_active_platform_admin\(\)/i, name);
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}`, "i"), name);
  }
});

test("invitation tokens are digest-only and bound to the invited email", () => {
  const body = migration.match(/create function public\.create_platform_doctor_invitation[\s\S]+?\$\$;/i)?.[0] ?? "";
  assert.match(body, /digest\(raw_token, 'sha256'\)/i);
  assert.match(body, /insert into public\.organization_invitations \([\s\S]+?token_digest[\s\S]+?\) values/i);
  assert.doesNotMatch(migration, /add column raw_token/i);
  assert.match(migration, /invitation\.invited_email = lower\(new\.email\)/i);
  assert.match(registration, /readOnly=\{Boolean\(invitationToken && initialEmail\)\}/);
});

test("free access is dated, non-overlapping, subscription-only and never deletes history", () => {
  assert.match(migration, /create table public\.doctor_free_access_periods/i);
  assert.match(migration, /doctor_free_access_no_overlap/i);
  assert.match(migration, /case when free_period\.covered then 0 else rate\.subscription_cents end/i);
  assert.match(migration, /rate\.sms_unit_cents \* count\(notification\.id\)/i);
  assert.doesNotMatch(migration, /delete from public\.(?:clinicians|doctor_free_access_periods|doctor_status_history)/i);
});

test("new lifecycle tables have RLS and no direct browser grants", () => {
  for (const table of ["doctor_free_access_periods", "doctor_status_history"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table}[\\s\\S]+?public, anon, authenticated`, "i"));
    assert.doesNotMatch(migration, new RegExp(`grant .* on (?:table )?public\\.${table}`, "i"));
  }
});

test("Doctor Admin UI is accordion-based and supports safe invitation and lifecycle changes", () => {
  assert.match(dashboard, /<details className="admin-doctor-invite"/);
  assert.match(dashboard, /<details className="admin-doctor-row"/);
  assert.match(dashboard, /createAdminDoctorInvitationAction/);
  assert.match(dashboard, /updateAdminDoctorAction/);
  assert.match(actions, /freeAccessMonths: z\.enum\(\["0", "3", "6", "12"\]\)/);
  assert.doesNotMatch(dashboard, /deleteDoctor|removeDoctor/i);
});

test("Administrator Doctor invitations use localized MXroute email and white-label output", () => {
  assert.match(actions, /sendInvitationEmail/);
  assert.match(actions, /kind: "platform_doctor"/);
  assert.match(email, /platform_doctor:/);
  assert.match(email, /brand\.name/);
});

test("Phase 4B Doctor controls have translation parity", () => {
  const keys = [
    "admin.doctor.invite.title", "admin.doctor.invite.description",
    "admin.doctor.invite.status.created", "admin.doctor.invite.status.created_email_failed",
    "admin.doctor.free.none", "admin.doctor.free.3", "admin.doctor.free.6", "admin.doctor.free.12",
    "admin.doctor.statusReason", "admin.doctor.save", "admin.doctor.update.saved",
    "admin.doctor.clinicAssociations", "admin.doctor.freeAccess", "admin.doctor.statusHistory",
  ];
  for (const language of ["en", "de", "ro", "hu"]) {
    for (const key of keys) assert.equal(typeof catalogs[language][key], "string", `${language}: ${key}`);
  }
});
