import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const migration = await read("supabase/migrations/202608130058_warranty_comeback_loyalty_tracking.sql");
const quality = await read("app/workshop-manager/quality/WorkshopQualityClient.tsx");
const actions = await read("app/workshop-manager/quality/actions.ts");
const customer = await read("app/customer/bookings/CustomerBookingsClient.tsx");
const organisation = await read("app/service-organisation/ServiceOrganisationDashboard.tsx");
const email = await read("lib/email/maintenance-reminders.ts");
const styles = await read("app/globals.css");

test("warranty and comeback cases are location-scoped and auditable", () => {
  assert.match(migration, /create table public\.workshop_warranty_cases/i);
  assert.match(migration, /original_booking_id uuid not null/i);
  assert.match(migration, /return_booking_id uuid not null unique/i);
  assert.match(migration, /responsible_technician_resource_id uuid/i);
  assert.match(migration, /internal_notes text/i);
  assert.match(migration, /resolution text/i);
  assert.match(migration, /alter table public\.workshop_warranty_cases enable row level security/i);
  assert.match(migration, /revoke all on table public\.workshop_warranty_cases/i);
  assert.match(migration, /private\.can_manage_automotive_workshop\(return_job\.workshop_id\)/i);
  assert.match(migration, /original_job\.workshop_id <> return_job\.workshop_id/i);
  assert.match(migration, /upper\(original_job\.vehicle_registration\) <> upper\(return_job\.vehicle_registration\)/i);
  assert.match(quality, /NewCase/);
  assert.match(quality, /resolveWarrantyCaseAction/);
});

test("labour and fitted-part warranties are available to quality tracking", () => {
  assert.match(migration, /add column labour_warranty_expires_on date/i);
  assert.match(migration, /set_workshop_job_warranty/i);
  assert.match(migration, /part\.warranty_expires_on/i);
  assert.match(quality, /partsWarranty/);
  assert.match(quality, /labourWarrantyExpiresOn/);
});

test("maintenance loyalty outreach is channel-specific, audited and customer-owned", () => {
  assert.match(migration, /create table public\.maintenance_outreach_events/i);
  assert.match(migration, /create table public\.customer_maintenance_notifications/i);
  assert.match(migration, /requested_channel not in \('phone', 'email', 'in_app'\)/i);
  assert.match(migration, /customer\.auth_user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /concat\('\/workshops\/', notification\.workshop_slug, '#appointment'\)/i);
  assert.match(actions, /sendMaintenanceReminderEmail/);
  assert.match(email, /MXROUTE_SERVER/);
  assert.match(customer, /MaintenanceToast/);
  assert.match(customer, /notification\.bookingUrl/);
});

test("service organisation owners receive cross-location comeback monitoring", () => {
  assert.match(migration, /get_service_organisation_quality_metrics/i);
  assert.match(migration, /private\.can_manage_service_organisation\(requested_service_provider_id\)/i);
  assert.match(organisation, /organisation-quality-summary/);
  assert.match(organisation, /comebackRate/);
  assert.match(styles, /\.quality-case-list[^\{]+\{[^}]+1\.618fr/i);
  assert.match(styles, /\.organisation-quality-summary>div[^\{]+\{[^}]+1\.618fr/i);
});
