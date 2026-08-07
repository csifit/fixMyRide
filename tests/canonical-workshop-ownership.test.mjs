import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608090037_canonical_workshop_catalogue_booking_ownership.sql");
const catalogueDal = await read("lib/dal/workshop-services.ts");
const bookingDal = await read("lib/dal/workshop-bookings.ts");
const catalogueActions = await read("app/workshop-manager/services/actions.ts");
const bookingActions = await read("app/workshop-manager/requests/actions.ts");

test("catalogue and bookings are backfilled and constrained to canonical workshops", () => {
  assert.match(migration, /rename column workshop_id to legacy_workshop_profile_id/gi);
  assert.match(migration, /workshop_services_workshop_id_fkey[\s\S]+?references public\.workshops\(id\)/i);
  assert.match(migration, /service_booking_requests_workshop_id_fkey[\s\S]+?references public\.workshops\(id\)/i);
  assert.match(migration, /service_booking_requests_service_workshop_fkey[\s\S]+?foreign key \(service_id, workshop_id\)/i);
  assert.match(migration, /Cannot migrate catalogue/);
  assert.match(migration, /Cannot migrate bookings/);
});

test("legacy workshop profile IDs are nullable derived rollback references", () => {
  assert.match(migration, /legacy_workshop_profile_id drop not null/gi);
  assert.match(migration, /create function private\.sync_legacy_workshop_reference/i);
  assert.match(migration, /select workshop\.legacy_workshop_profile_id[\s\S]+?into legacy_profile_id/i);
  assert.match(migration, /workshops_ensure_initial_diagnosis/i);
  assert.match(migration, /drop trigger if exists workshop_profiles_ensure_initial_diagnosis/i);
});

test("active catalogue and manual-booking contracts use canonical workshop IDs", () => {
  assert.match(catalogueDal, /get_my_workshop_service_catalogue_v3/);
  assert.match(catalogueDal, /create_managed_workshop_service_v3/);
  assert.match(catalogueDal, /requested_workshop_id: workshopId/);
  assert.match(bookingDal, /create_managed_service_appointment_v2/);
  assert.match(bookingDal, /requested_workshop_id: input\.workshopId/);
  assert.doesNotMatch(catalogueActions, /serviceProviderId/);
  assert.doesNotMatch(bookingActions, /workshopProfileId/);
});

test("public, manager, customer, notification, and admin reads use canonical ownership", () => {
  for (const functionName of [
    "search_public_workshops",
    "get_public_workshop_services_v2",
    "create_public_service_booking_request",
    "get_managed_service_booking_requests",
    "get_my_service_booking_requests",
    "claim_due_service_booking_notifications",
    "get_automotive_admin_snapshot",
  ]) assert.ok(migration.includes(functionName), functionName);
  assert.match(migration, /service\.workshop_id = booking\.workshop_id/);
  assert.match(migration, /workshop\.id = booking\.workshop_id/);
  assert.match(migration, /booking\.workshop_id = requested_workshop_id/);
});
