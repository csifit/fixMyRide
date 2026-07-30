import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL(
  "supabase/migrations/202607300012_post_booking_management.sql",
  root,
), "utf8");
const patientActions = await readFile(new URL(
  "app/appointments/status/actions.ts",
  root,
), "utf8");
const patientStatus = await readFile(new URL(
  "app/appointments/status/StatusClient.tsx",
  root,
), "utf8");
const manager = await readFile(new URL(
  "app/appointments/AppointmentManager.tsx",
  root,
), "utf8");
const managementActions = await readFile(new URL(
  "app/appointments/actions.ts",
  root,
), "utf8");
const lifecycleEmail = await readFile(new URL(
  "lib/email/appointment-lifecycle.ts",
  root,
), "utf8");

test("patient appointment changes use protected tokens and no direct table grants", () => {
  assert.match(migration, /alter table public\.public_appointment_change_requests enable row level security/i);
  assert.match(migration, /revoke all on table public\.public_appointment_change_requests[\s\S]+?anon, authenticated/i);
  assert.match(migration, /create function public\.create_public_appointment_change_request/i);
  assert.match(migration, /management_token_digest = requested_management_token_digest/i);
  assert.doesNotMatch(migration, /grant (select|insert|update|delete).*public_appointment_change_requests.*anon/i);
  assert.match(patientActions, /createHash\("sha256"\)/i);
});

test("patients can request changes but cannot decide or directly mutate appointments", () => {
  assert.match(migration, /grant execute on function public\.create_public_appointment_change_request[\s\S]+?to anon, authenticated/i);
  assert.doesNotMatch(migration, /grant execute on function public\.decide_public_appointment_change_request[\s\S]{0,120}?to anon/i);
  assert.doesNotMatch(patientActions, /transitionManagedAppointment|rescheduleSlottedAppointment/i);
  assert.match(patientStatus, /originalAppointmentRemains/i);
  assert.match(migration, /public_appointment_one_pending_change_idx/i);
});

test("Doctor and assigned Staff approve cancellation or rescheduling requests", () => {
  assert.match(migration, /private\.can_manage_doctor_appointments\(change_request\.clinician_id\)/i);
  assert.match(migration, /perform public\.transition_managed_appointment/i);
  assert.match(migration, /perform public\.reschedule_slotted_appointment/i);
  assert.match(manager, /decideAppointmentChangeRequestAction/i);
  assert.match(manager, /appointments\.changeQueue/i);
});

test("booking decisions send localized lifecycle emails and confirmation SMS", () => {
  for (const language of ["en", "de", "ro", "hu"]) {
    assert.match(lifecycleEmail, new RegExp(`\\b${language}:\\s*\\{`));
  }
  assert.match(lifecycleEmail, /#006E6E/i);
  assert.match(managementActions, /sendAppointmentDecisionEmail/i);
  assert.match(managementActions, /sendAppointmentChangeDecisionEmail/i);
  assert.match(managementActions, /tryImmediateSms\(appointmentId\)/i);
});

