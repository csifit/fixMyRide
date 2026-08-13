import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const migration = await read("supabase/migrations/202608130057_multi_location_organisation_dashboard.sql");
const dashboard = await read("app/service-organisation/ServiceOrganisationDashboard.tsx");
const dashboardPage = await read("app/service-organisation/page.tsx");
const dashboardDal = await read("lib/dal/service-organisation-dashboard.ts");
const customer = await read("app/customer/bookings/CustomerBookingsClient.tsx");
const customerActions = await read("app/customer/bookings/actions.ts");
const report = await read("app/api/service-organisation/[providerId]/monthly-report/route.ts");
const styles = await read("app/globals.css");

test("customer satisfaction is collected only after the customer's completed visit", () => {
  assert.match(migration, /create table public\.service_booking_feedback/i);
  assert.match(migration, /alter table public\.service_booking_feedback enable row level security/i);
  assert.match(migration, /revoke all on table public\.service_booking_feedback from public, anon, authenticated/i);
  assert.match(migration, /booking_row\.customer_id is distinct from customer_id/i);
  assert.match(migration, /booking_row\.status <> 'completed'/i);
  assert.match(migration, /rating smallint not null check \(rating between 1 and 5\)/i);
  assert.match(customer, /ServiceFeedbackForm/);
  assert.match(customerActions, /submitServiceFeedbackAction/);
});

test("multi-location reporting is organisation-owner-only and canonical", () => {
  assert.match(migration, /create function public\.get_service_organisation_operational_dashboard/i);
  assert.match(migration, /not private\.can_manage_service_organisation\(provider_row\.id\)/i);
  assert.doesNotMatch(migration.match(/create function public\.get_service_organisation_operational_dashboard[\s\S]+?\$\$;/i)?.[0] ?? "", /can_manage_automotive_workshop/);
  for (const source of ["service_booking_requests", "vehicle_service_records", "repair_estimates", "workshop_inventory_items", "service_booking_feedback"]) assert.match(migration, new RegExp(`public\\.${source}`));
  for (const metric of ["appointments", "activeJobs", "workloadMinutes", "revenueByCurrency", "openEstimates", "overdueJobs", "inventoryAlerts", "averageRating", "cancellationRate"]) assert.match(migration, new RegExp(`'${metric}'`));
  assert.match(dashboardDal, /get_service_organisation_operational_dashboard/);
  assert.match(dashboardPage, /getServiceOrganisationAccess/);
  assert.match(dashboardPage, /loadServiceOrganisationOperationalDashboard/);
});

test("owners receive comparison, exceptions, inventory alerts and six-month reports", () => {
  assert.match(dashboard, /LocationComparison/);
  assert.match(dashboard, /organisation-location-table/);
  assert.match(dashboard, /organisation-exceptions/);
  assert.match(dashboard, /organisation-monthly-report/);
  assert.match(dashboard, /inventoryAlerts/);
  assert.match(dashboard, /cancellationRate/);
  assert.match(dashboard, /averageRating/);
  assert.match(report, /getServiceOrganisationAccess/);
  assert.match(report, /organisationIds\.includes\(providerId\)/);
  assert.match(report, /text\/csv/);
  assert.match(styles, /\.organisation-dashboard-hero[^{]+\{[^}]+1\.618fr/i);
  assert.match(styles, /\.organisation-exceptions[^{]+\{[^}]+1\.618fr/i);
});
