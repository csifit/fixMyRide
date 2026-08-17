import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = "supabase/migrations/202608170062_service_orders_resource_safe_scheduling.sql";

test("service orders have stable references and workshop-only editable handover details", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create sequence public\.service_order_reference_seq/i);
  assert.match(sql, /add column service_order_number text/i);
  assert.match(sql, /service_order_mechanic_override text/i);
  assert.match(sql, /vehicle_reception_condition text/i);
  assert.match(sql, /create trigger service_booking_requests_assign_service_order_number/i);
  assert.match(sql, /private\.can_manage_automotive_workshop\(booking_row\.workshop_id\)/i);
  assert.match(sql, /create function public\.update_managed_service_order_details/i);
  assert.match(sql, /create function public\.get_managed_service_order/i);
});

test("all booking time mutations are guarded by one resource-aware trigger", async () => {
  const [sql, narrowedGuard] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile("supabase/migrations/202608170063_narrow_resource_schedule_guard.sql", "utf8"),
  ]);
  assert.match(sql, /create function private\.assert_service_booking_resources_available/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /workshop_resource_absences/i);
  assert.match(sql, /service_booking_requests_resource_schedule_guard/i);
  assert.match(sql, /before insert or update of status, confirmed_start, duration_minutes/i);
  assert.match(sql, /other\.status in \(\s*'confirmed', 'checked_in', 'diagnosing', 'awaiting_approval', 'in_service'/i);
  assert.match(sql, /create or replace function public\.update_managed_booking_schedule/i);
  assert.match(sql, /perform private\.assert_service_booking_resources_available/i);
  assert.match(narrowedGuard, /new\.confirmed_start is distinct from old\.confirmed_start/i);
  assert.match(narrowedGuard, /new\.duration_minutes is distinct from old\.duration_minutes/i);
  assert.match(narrowedGuard, /old\.status not in \('confirmed', 'checked_in', 'diagnosing', 'awaiting_approval', 'in_service'\)/i);
  assert.doesNotMatch(narrowedGuard, /new\.status is distinct from old\.status/i);
});

test("service order is available to both workshop and service organisation repair screens", async () => {
  const [client, organisationPage, controls, actions] = await Promise.all([
    readFile("app/workshop-manager/repairs/WorkshopRepairsClient.tsx", "utf8"),
    readFile("app/service-organisation/repairs/page.tsx", "utf8"),
    readFile("app/workshop-manager/repairs/ServiceOrderControls.tsx", "utf8"),
    readFile("app/workshop-manager/repairs/actions.ts", "utf8"),
  ]);
  assert.match(client, /\["confirmed", "checked_in"\]\.includes\(repair\.status\)/);
  assert.match(client, /<ServiceOrderControls repair=\{repair\}/);
  assert.match(organisationPage, /WorkshopRepairsClient/);
  assert.match(controls, /serviceOrderMechanicOverride/);
  assert.match(controls, /vehicleReceptionCondition/);
  assert.match(controls, /\/api\/service-orders\/\$\{repair\.id\}/);
  assert.match(actions, /updateManagedServiceOrderDetails/);
});

test("print route returns an inline private PDF and the order has mechanic handover sections", async () => {
  const [route, pdf] = await Promise.all([
    readFile("app/api/service-orders/[bookingId]/route.ts", "utf8"),
    readFile("lib/pdf/service-order.ts", "utf8"),
  ]);
  assert.match(route, /"content-type": "application\/pdf"/);
  assert.match(route, /"content-disposition": `inline;/);
  assert.match(route, /"cache-control": "private, no-store"/);
  for (const heading of [
    "Customer request", "Vehicle reception condition", "Diagnosis and approved work",
    "Parts and consumables", "Work performed and mechanic notes",
    "Quality control and test drive", "Recommendations and next service",
    "Handover and signatures",
  ]) assert.match(pdf, new RegExp(heading, "i"));
  assert.match(pdf, /Calendar resources remain authoritative/);
});

test("service order labels are localized in every supported language", async () => {
  for (const language of ["en", "de", "ro", "hu"]) {
    const dictionary = JSON.parse(await readFile(`app/i18n/${language}.json`, "utf8"));
    for (const key of [
      "serviceOrder.title", "serviceOrder.mechanicOverride", "serviceOrder.receptionCondition",
      "serviceOrder.save", "serviceOrder.print", "serviceOrder.result.saved",
    ]) assert.equal(typeof dictionary[key], "string", `${language} is missing ${key}`);
  }
});
