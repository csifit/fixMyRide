import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608110043_workshop_publication_location_access.sql");
const home = await read("app/HomeDiscoveryClient.tsx");
const map = await read("app/PublicWorkshopMap.tsx");
const loader = await read("lib/google-maps-loader.ts");

test("publication is automatic, geocoded, manager-backed, and location-covered", () => {
  assert.match(migration, /create function private\.is_workshop_publication_eligible/);
  assert.match(migration, /workshop\.status in \('pending', 'active'\)/);
  assert.match(migration, /workshop\.latitude between -90 and 90/);
  assert.match(migration, /workshop\.longitude between -180 and 180/);
  assert.match(migration, /assignment\.assignment_role = 'primary_manager'/);
  assert.match(migration, /identity\.status = 'active'/);
  assert.match(migration, /private\.has_workshop_billing_coverage\(workshop\.id\)/);
  assert.match(migration, /where private\.is_workshop_publication_eligible\(workshop\.id\)/);
});

test("map publication remains independent from accepting online bookings", () => {
  const search = migration.match(/create or replace function public\.search_public_workshops[\s\S]+?\$\$;/)?.[0] ?? "";
  assert.doesNotMatch(search, /accepts_booking_requests/);
  assert.match(migration, /get_public_workshop_booking_rules[\s\S]+workshop\.accepts_booking_requests/);
  assert.match(migration, /create_public_service_booking_request[\s\S]+workshop\.accepts_booking_requests/);
});

test("workshop operations require an active assignment to the exact location", () => {
  assert.match(migration, /create function private\.current_workshop_manager_id/);
  assert.match(migration, /assignment\.workshop_id = workshop\.id/);
  assert.match(migration, /assignment\.starts_on <= current_date/);
  assert.match(migration, /membership\.service_provider_id = workshop\.service_provider_id/);
  assert.match(migration, /manager\.auth_user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /can_manage_automotive_workshop[\s\S]+current_workshop_manager_id/);
});

test("booking and repair mutation RPCs resolve authorization from the booking location", () => {
  assert.match(migration, /manage_service_booking_request[\s\S]+manager_id := private\.current_workshop_manager_id\(booking_row\.workshop_id\)/);
  assert.match(migration, /manage_repair_workflow[\s\S]+manager_id := private\.current_workshop_manager_id\(booking_row\.workshop_id\)/);
  assert.match(migration, /get_managed_repair_workflows[\s\S]+workshop\.id = booking\.workshop_id[\s\S]+can_manage_automotive_workshop\(booking\.workshop_id\)/);
  assert.doesNotMatch(migration, /legacy_workshop_profile_id/);
});

test("public discovery renders a real Google map with filtered workshop markers", () => {
  assert.match(home, /<PublicWorkshopMap workshops=\{filtered\}/);
  assert.match(map, /importLibrary\("maps"\)/);
  assert.match(map, /importLibrary\("marker"\)/);
  assert.match(map, /new google\.maps\.marker\.AdvancedMarkerElement/);
  assert.match(map, /map\.current\.fitBounds/);
  assert.match(map, /View workshop/);
  assert.match(loader, /NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID/);
});
