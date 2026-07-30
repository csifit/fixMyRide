import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL(
  "supabase/migrations/202607300008_doctor_availability_calendar.sql",
  root,
), "utf8");
const manager = await readFile(new URL("app/appointments/AppointmentManager.tsx", root), "utf8");
const actions = await readFile(new URL("app/appointments/actions.ts", root), "utf8");
const email = await readFile(new URL("lib/email/appointment.ts", root), "utf8");
const patientRegistration = await readFile(new URL("app/register/patient/page.tsx", root), "utf8");

const lockedMigrations = [
  ["supabase/migrations/202607290001_phase_2b1_foundation.sql", "D60DC87BADB25C0D35894DF484B1E938D7BDA5320FB669359C8740F2E018B95B"],
  ["supabase/migrations/202607290002_superadmin_foundation.sql", "1BF924E14C71FE4CEAC19DF49E62C47FD048ADF577852BBF86EF9E8EBEC6A871"],
  ["supabase/migrations/202607300003_health_card_compatible_profile.sql", "F6A8DDB7CB89CE4635DB0B09673EE395C18C22AA19E0E96F3DA4F28527D25F6F"],
  ["supabase/migrations/202607300004_clinic_organization_foundation.sql", "DDEC5D88C5F334BE3E8FF9BFFFE63F2046311DEF66A20263057CCFBC80E089DB"],
  ["supabase/migrations/202607300005_phase_2d_runtime_fixes.sql", "B0A55F4EBF64EA9CDDB36291ACFF6EF4A13E129188BF63E20CF913E7D151A2F1"],
  ["supabase/migrations/202607300006_appointment_management_foundation.sql", "AED7C536F61154D45F7B8C2976F59288378FC5FBABFB2A0809A74A6CB9F54811"],
  ["supabase/migrations/202607300007_phase_2e_policy_helper_grants.sql", "27F3D1E37D663BF040330BF359671058505FC6B74786A9D2C6F738A457207342"],
];

test("Phase 3 preserves every earlier migration byte-for-byte", async () => {
  for (const [file, hash] of lockedMigrations) {
    const contents = await readFile(new URL(file, root));
    assert.equal(createHash("sha256").update(contents).digest("hex").toUpperCase(), hash, file);
  }
});

test("new and rescheduled appointments use only 15, 30, or 45-minute slots", () => {
  assert.match(migration, /slot_duration_minutes in \(15, 30, 45\)/i);
  assert.match(migration, /create function public\.create_slotted_appointment/i);
  assert.match(migration, /create function public\.reschedule_slotted_appointment/i);
  assert.match(migration, /availability\.slot_duration_minutes <> requested_slot_duration_minutes/i);
  assert.match(migration, /private\.can_manage_doctor_appointments\(requested_clinician_id\)/i);
  assert.doesNotMatch(manager, /datetime-local/i);
  assert.match(actions, /z\.literal\(15\).*z\.literal\(30\).*z\.literal\(45\)/is);
});

test("availability remains simple: one read policy and Doctor-owned RPC writes", () => {
  assert.match(migration, /create policy doctor_availability_authorized_read/i);
  assert.match(migration, /revoke all on table public\.doctor_availability[\s\S]+?grant select/i);
  assert.match(migration, /where clinician\.auth_user_id = auth\.uid\(\)[\s\S]+?verification_status = 'approved'/i);
  assert.doesNotMatch(migration, /as restrictive|aal2|mfa/i);
});

test("appointment email contains details and a prefilled VitaPass registration link", () => {
  assert.match(actions, /sendAppointmentCreatedEmail/i);
  assert.match(email, /\/register\/patient\?email=/i);
  assert.match(email, /scheduledStart|slotDurationMinutes|doctorName/i);
  assert.match(email, /Europe\/Bucharest/i);
  assert.match(patientRegistration, /initialEmail/i);
});

test("the appointment manager includes a weekly calendar and generated free slots", () => {
  assert.match(manager, /function slotsFor/i);
  assert.match(manager, /function Calendar/i);
  assert.match(manager, /calendar-grid/i);
  assert.match(manager, /blockingStatuses/i);
});
