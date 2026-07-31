import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202607310015_doctor_profiles_workspaces_billing.sql");
const doctorPortal = await read("app/doctor/DoctorPortalClient.tsx");
const doctorInvoice = await read("app/doctor/invoicing/page.tsx");
const doctorProfile = await read("app/doctors/[doctorId]/DoctorPublicProfile.tsx");
const managerClinics = await read("app/clinic-manager/clinics/ClinicSettingsClient.tsx");
const managerBilling = await read("app/clinic-manager/invoicing/ClinicBillingOverviewClient.tsx");
const exportRoute = await read("app/api/billing-export/route.ts");

test("public Doctor cards lead to dedicated profiles with booking actions", async () => {
  const home = await read("app/HomeDiscoveryClient.tsx");
  assert.match(home, /href={`\/doctors\/\$\{doctor\.id\}/i);
  assert.match(doctorProfile, /doctor\.professionalBio/i);
  assert.match(doctorProfile, /appointments\/\$\{doctor\.id\}/i);
  assert.match(migration, /professional_bio text/i);
  assert.match(migration, /clinician\.verification_status = 'approved'/i);
});

test("Doctor workspace ownership is derived from active sponsorship", () => {
  assert.match(migration, /create function public\.get_my_doctor_workspace/i);
  assert.match(migration, /clinic_sponsorship_periods/i);
  assert.match(migration, /sponsored\.clinic_id is null, sponsored\.clinic_id is null/i);
  assert.match(migration, /Clinic-sponsored Doctors cannot edit clinic details/i);
  assert.match(doctorPortal, /canEditBilling &&/i);
  assert.match(doctorInvoice, /if \(!workspace\?\.canEditBilling\) redirect/i);
});

test("Clinic Managers can manage multiple locations without granting Doctors clinic edits", () => {
  assert.match(migration, /create function public\.create_managed_clinic/i);
  assert.match(migration, /create function public\.update_managed_clinic/i);
  assert.match(migration, /membership\.membership_role in \('owner', 'manager'\)/i);
  assert.match(managerClinics, /clinics\.map/i);
  assert.match(managerClinics, /createClinicAction/i);
});

test("billing overviews are itemized, limited to six months and export closed months as CSV", () => {
  assert.match(migration, /create function public\.get_clinic_billing_usage/i);
  assert.match(migration, /least\(greatest\(requested_months, 1\), 6\)/i);
  assert.match(migration, /notification\.status = 'sent'/i);
  assert.match(migration, /create table public\.billing_rates/i);
  assert.match(migration, /create function public\.set_next_billing_rates/i);
  assert.match(managerBilling, /billing\.smsCost/i);
  assert.match(managerBilling, /row\.clinicianName/i);
  assert.match(exportRoute, /text\/csv/i);
  assert.match(exportRoute, /row\.status === "closed"/i);
});

test("platform accounting is restricted to AAL2 Superadmin or accounting-enabled Managers", () => {
  assert.match(migration, /create function private\.has_platform_accounting_access/i);
  assert.match(migration, /auth\.jwt\(\)->>'aal'\) = 'aal2'/i);
  assert.match(migration, /administrator\.role::text in \('superadmin', 'admin'\)[\s\S]+administrator\.accounting_access/i);
  assert.match(migration, /create function public\.get_platform_billing_usage/i);
});
