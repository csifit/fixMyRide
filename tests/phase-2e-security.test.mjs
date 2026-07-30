import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL(
  "supabase/migrations/202607300006_appointment_management_foundation.sql",
  root,
), "utf8");
const policyGrantFix = await readFile(new URL(
  "supabase/migrations/202607300007_phase_2e_policy_helper_grants.sql",
  root,
), "utf8");
const actions = await readFile(new URL("app/appointments/actions.ts", root), "utf8");
const smslink = await readFile(new URL("lib/sms/smslink.ts", root), "utf8");
const cron = await readFile(new URL("app/api/cron/appointment-reminders/route.ts", root), "utf8");

const lockedMigrations = [
  ["supabase/migrations/202607290001_phase_2b1_foundation.sql", "D60DC87BADB25C0D35894DF484B1E938D7BDA5320FB669359C8740F2E018B95B"],
  ["supabase/migrations/202607290002_superadmin_foundation.sql", "1BF924E14C71FE4CEAC19DF49E62C47FD048ADF577852BBF86EF9E8EBEC6A871"],
  ["supabase/migrations/202607300003_health_card_compatible_profile.sql", "F6A8DDB7CB89CE4635DB0B09673EE395C18C22AA19E0E96F3DA4F28527D25F6F"],
  ["supabase/migrations/202607300004_clinic_organization_foundation.sql", "DDEC5D88C5F334BE3E8FF9BFFFE63F2046311DEF66A20263057CCFBC80E089DB"],
  ["supabase/migrations/202607300005_phase_2d_runtime_fixes.sql", "B0A55F4EBF64EA9CDDB36291ACFF6EF4A13E129188BF63E20CF913E7D151A2F1"],
  ["supabase/migrations/202607300006_appointment_management_foundation.sql", "AED7C536F61154D45F7B8C2976F59288378FC5FBABFB2A0809A74A6CB9F54811"],
];

test("Phase 2E preserves every applied migration byte-for-byte", async () => {
  for (const [file, hash] of lockedMigrations) {
    const contents = await readFile(new URL(file, root));
    assert.equal(createHash("sha256").update(contents).digest("hex").toUpperCase(), hash, file);
  }
});

test("patients cannot confirm and only Doctor or assigned Staff manage appointments", () => {
  assert.match(migration, /create function private\.can_manage_doctor_appointments/i);
  assert.match(migration, /staff_doctor_assignments[\s\S]+?assignment\.status = 'active'/i);
  assert.match(migration, /clinician\.verification_status = 'approved'/i);
  const actor = migration.match(
    /create function private\.current_appointment_actor\(\)[\s\S]+?\$\$;/i,
  )?.[0] ?? "";
  assert.doesNotMatch(actor, /public\.patients|account_type = 'patient'/i);
  assert.match(migration, /revoke insert, update, delete, truncate[\s\S]+?appointments[\s\S]+?from authenticated/i);
  assert.match(actions, /status:\s*z\.enum\(\["confirmed", "rescheduled", "cancelled", "completed", "no_show"\]\)/i);
});

test("confirmed appointments queue one confirmation and one 24-hour reminder", () => {
  assert.match(migration, /unique \(appointment_id, kind\)/i);
  assert.match(migration, /'confirmation', now\(\)/i);
  assert.match(migration, /appointment\.scheduled_start - interval '24 hours'/i);
  assert.match(migration, /on conflict \(appointment_id, kind\)/i);
  assert.match(migration, /for update of notification skip locked/i);
});

test("SMSLink uses its HTTPS JSON POST API and never places credentials in a URL", () => {
  assert.match(smslink, /https:\/\/secure\.smslink\.ro\/sms\/gateway\/communicate\/json\.php/i);
  assert.match(smslink, /method:\s*"POST"/i);
  assert.match(smslink, /application\/x-www-form-urlencoded/i);
  assert.doesNotMatch(smslink, /\?connection_id=/i);
  assert.match(smslink, /AbortSignal\.timeout\(10_000\)/i);
  assert.match(cron, /authorization.*Bearer/i);
});

test("Staff profile access is assigned, view-only, audited, and excludes identifiers", () => {
  assert.match(migration, /create function private\.staff_has_patient_access/i);
  assert.match(migration, /record_staff_patient_profile_view[\s\S]+?'patient_profile_viewed'/i);
  assert.doesNotMatch(migration, /patient_sensitive_identifiers_staff|sensitive.*staff_assigned/i);
  assert.match(migration, /create policy diagnoses_staff_assigned_read/i);
});

test("RLS policy helpers are executable without exposing internal actor helpers", () => {
  assert.match(policyGrantFix, /grant execute on function private\.can_manage_doctor_appointments\(uuid\)[\s\S]+?to authenticated/i);
  assert.match(policyGrantFix, /grant execute on function private\.staff_has_patient_access\(uuid\)[\s\S]+?to authenticated/i);
  assert.doesNotMatch(policyGrantFix, /current_appointment_actor|grant .* on table/i);
});
