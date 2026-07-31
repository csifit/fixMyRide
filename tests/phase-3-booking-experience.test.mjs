import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL(
  "supabase/migrations/202607300011_public_appointment_booking.sql",
  root,
), "utf8");
const publicActions = await readFile(new URL("app/appointments/public-actions.ts", root), "utf8");
const reserveFlow = await readFile(new URL(
  "app/appointments/[doctorId]/reserve/ReserveFlow.tsx",
  root,
), "utf8");
const search = await readFile(new URL("app/appointments/DoctorSearchClient.tsx", root), "utf8");
const availability = await readFile(new URL(
  "app/appointments/[doctorId]/DoctorAvailabilityClient.tsx",
  root,
), "utf8");
const email = await readFile(new URL("lib/email/appointment-request.ts", root), "utf8");
const managementActions = await readFile(new URL("app/appointments/actions.ts", root), "utf8");

test("public booking exposes narrow RPCs without direct table access", () => {
  assert.match(migration, /alter table public\.public_appointment_requests enable row level security/i);
  assert.match(migration, /revoke all on table public\.public_appointment_requests[\s\S]+?anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.search_public_doctors\(text\) to anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.get_public_doctor_slots\(uuid, date\) to anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.create_public_appointment_request[\s\S]+?to anon, authenticated/i);
  assert.doesNotMatch(migration, /grant (select|insert|update|delete).*public_appointment_requests.*anon/i);
});

test("patients request pending appointments and cannot confirm them", () => {
  assert.match(migration, /status text not null default 'pending'/i);
  assert.match(migration, /requested_decision not in \('confirmed', 'declined'\)/i);
  assert.match(migration, /private\.can_manage_doctor_appointments\(booking_request\.clinician_id\)/i);
  assert.match(migration, /decide_public_appointment_request[\s\S]+?to authenticated/i);
  assert.doesNotMatch(migration, /grant execute on function public\.decide_public_appointment_request[\s\S]{0,120}?to anon/i);
  assert.match(managementActions, /dispatchDueAppointmentNotifications/i);
});

test("public slots come only from active Doctor availability and exclude occupied times", () => {
  assert.match(migration, /availability\.is_active/i);
  assert.match(migration, /clinician\.verification_status = 'approved'/i);
  assert.match(migration, /appointment\.status in \('confirmed', 'rescheduled'\)/i);
  assert.match(migration, /request\.status = 'pending'/i);
  assert.match(migration, /public_appointment_one_pending_slot_idx/i);
});

test("management links store only SHA-256 digests", () => {
  assert.match(publicActions, /randomBytes\(32\)/i);
  assert.match(publicActions, /createHash\("sha256"\)/i);
  assert.match(migration, /management_token_digest bytea not null unique/i);
  assert.doesNotMatch(migration, /management_token\s+text/i);
});

test("patient booking follows search, availability, details, review and status steps", () => {
  assert.match(search, /booking-search/i);
  assert.match(availability, /public-slot-grid/i);
  assert.match(reserveFlow, /setStep\(2\)/i);
  assert.match(reserveFlow, /booking-review/i);
  assert.match(reserveFlow, /appointments\/status\?token=/i);
  assert.doesNotMatch(reserveFlow, /password/i);
});

test("request email contains appointment details, protected status and account links", () => {
  assert.match(email, /appointments\/status\?token=/i);
  assert.match(email, /register\/patient\?email=/i);
  assert.match(email, /scheduledStart|doctorName|clinicName|slotDurationMinutes/i);
  assert.match(email, /Europe\/Bucharest/i);
});

test("public booking accepts timezone offsets returned by PostgreSQL", () => {
  assert.match(
    publicActions,
    /scheduledStart:\s*z\.iso\.datetime\(\{\s*offset:\s*true\s*\}\)/,
  );
});
