import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const page = await readFile(new URL("app/page.tsx", root), "utf8");
const homepage = await readFile(new URL("app/HomeDiscoveryClient.tsx", root), "utf8");
const googleMap = await readFile(new URL("app/GoogleDoctorMap.tsx", root), "utf8");
const environment = await readFile(new URL(".env.example", root), "utf8");
const patientPage = await readFile(new URL("app/patient/page.tsx", root), "utf8");
const patientAppointments = await readFile(new URL(
  "app/patient/appointments/PatientAppointmentCenter.tsx",
  root,
), "utf8");
const migration = await readFile(new URL(
  "supabase/migrations/202607310014_public_doctor_locations.sql",
  root,
), "utf8");
const dal = await readFile(new URL("lib/dal/public-appointments.ts", root), "utf8");

test("the public root loads approved Doctors into the discovery homepage", () => {
  assert.match(page, /searchPublicDoctors\(""\)/i);
  assert.match(page, /<HomeDiscoveryClient/i);
  assert.match(homepage, /home-discovery/i);
  assert.match(homepage, /home-map/i);
  assert.match(homepage, /home-filter-form/i);
});

test("homepage provides map selection, filters, Doctor cards and four-column footer", () => {
  assert.match(homepage, /<GoogleDoctorMap/i);
  assert.match(googleMap, /onSelectRef\.current\(doctor\.id\)/i);
  assert.match(homepage, /setSpecialty/i);
  assert.match(homepage, /setLocation/i);
  assert.match(homepage, /home-doctor-grid/i);
  assert.match(homepage, /☆☆☆☆☆/u);
  assert.match(homepage, /home-footer/i);
  assert.match(homepage, /footer\.platform/i);
  assert.match(homepage, /footer\.professionals/i);
  assert.match(homepage, /footer\.legal/i);
  assert.match(homepage, /footer\.contact/i);
});

test("Google Maps loads on demand and keeps a keyless fallback", () => {
  assert.match(googleMap, /@googlemaps\/js-api-loader/i);
  assert.match(googleMap, /importLibrary\("maps"\)/i);
  assert.match(googleMap, /importLibrary\("marker"\)/i);
  assert.match(googleMap, /AdvancedMarkerElement/i);
  assert.match(googleMap, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/i);
  assert.match(googleMap, /if \(apiKey && !loadFailed\)/i);
  assert.match(googleMap, /home-map-canvas/i);
  assert.match(environment, /^NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$/m);
});

test("patient medical folder remains available at its own route", () => {
  assert.match(patientPage, /PatientPortal/i);
  assert.match(patientPage, /patientPortalData/i);
  assert.match(patientAppointments, /href="\/patient"/i);
});

test("Doctor location fields are additive and public search remains narrow", () => {
  assert.match(migration, /alter table public\.clinicians/i);
  assert.match(migration, /add column city text/i);
  assert.match(migration, /add column practice_address text/i);
  assert.match(migration, /latitude numeric\(9, 6\)/i);
  assert.match(migration, /longitude numeric\(9, 6\)/i);
  assert.match(migration, /clinician\.verification_status = 'approved'/i);
  assert.match(migration, /grant execute on function public\.search_public_doctors\(text\)\s+to anon, authenticated/i);
  assert.doesNotMatch(migration, /grant (select|insert|update|delete).*clinicians/i);
  assert.match(dal, /practiceAddress/i);
});
