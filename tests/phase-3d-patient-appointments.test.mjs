import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL(
  "supabase/migrations/202607300013_patient_appointment_center.sql",
  root,
), "utf8");
const patientActions = await readFile(new URL("app/patient/actions.ts", root), "utf8");
const patientPage = await readFile(new URL(
  "app/patient/appointments/PatientAppointmentCenter.tsx",
  root,
), "utf8");
const medicalFolder = await readFile(new URL("app/PatientPortalClient.tsx", root), "utf8");
const brand = await readFile(new URL("lib/brand.ts", root), "utf8");
const layout = await readFile(new URL("app/layout.tsx", root), "utf8");

test("verified Patient accounts link guest and manually created appointments", () => {
  assert.match(migration, /private\.current_patient_id\(\)/i);
  assert.match(migration, /patient\.auth_user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /verified_email text := lower\(nullif\(auth\.jwt\(\)->>'email'/i);
  assert.match(migration, /lower\(request\.patient_email\) = verified_email/i);
  assert.match(migration, /lower\(appointment\.patient_email\) = verified_email/i);
  assert.match(migration, /insert into public\.public_appointment_requests/i);
});

test("patient appointment reads and changes use narrow authenticated RPCs", () => {
  assert.match(migration, /create function public\.load_my_patient_appointments/i);
  assert.match(migration, /create function public\.cancel_my_pending_appointment_request/i);
  assert.match(migration, /create function public\.create_my_appointment_change_request/i);
  assert.match(migration, /grant execute on function public\.load_my_patient_appointments\(\)\s+to authenticated/i);
  assert.doesNotMatch(migration, /grant execute on function public\.(load_my_patient_appointments|create_my_appointment_change_request)[\s\S]{0,160}?to anon/i);
  assert.doesNotMatch(patientActions, /transitionManagedAppointment|rescheduleSlottedAppointment/i);
});

test("Doctor or assigned Staff still approves patient change requests", () => {
  assert.match(migration, /insert into public\.public_appointment_change_requests/i);
  assert.doesNotMatch(migration, /status\s*=\s*'approved'/i);
  assert.match(patientPage, /originalAppointmentRemains/i);
  assert.match(patientPage, /createMyAppointmentChangeAction/i);
});

test("Patient Appointment Center keeps the medical folder available", () => {
  assert.match(patientPage, /patientAppointments\.medicalFolder/i);
  assert.match(patientPage, /href="\/patient"/i);
  assert.match(medicalFolder, /href="\/patient\/appointments"/i);
  assert.match(medicalFolder, /patient\.section\.personal/i);
  assert.match(medicalFolder, /patient\.share\.title/i);
});

test("new product surfaces use central white-label configuration", () => {
  assert.match(brand, /NEXT_PUBLIC_BRAND_NAME/i);
  assert.match(brand, /NEXT_PUBLIC_BRAND_PRIMARY_COLOR/i);
  assert.match(brand, /NEXT_PUBLIC_BRAND_SUPPORT_EMAIL/i);
  assert.match(layout, /brand\.name/i);
  assert.match(layout, /--brand-primary/i);
  assert.match(patientPage, /brand\.name/i);
});
