import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608060022_automotive_booking_foundation.sql");
const home = await read("app/HomeDiscoveryClient.tsx");
const requestFlow = await read("app/workshops/[workshopId]/request/ServiceRequestFlow.tsx");
const requestAction = await read("app/workshops/[workshopId]/request/actions.ts");
const garage = await read("app/garage/GarageClient.tsx");
const garageDal = await read("lib/dal/garage.ts");

test("automotive records are additive and customer-owned vehicle data is protected by RLS", () => {
  for (const table of ["workshop_profiles", "workshop_services", "customer_profiles", "vehicles", "service_booking_requests", "provider_subscription_plans"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`, "i"), table);
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"), table);
  }
  assert.match(migration, /vehicles_customer_owns_vehicle/i);
  assert.match(migration, /customer\.auth_user_id = \(select auth\.uid\(\)\)/i);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete).*workshop_profiles.*to anon/i);
});

test("public workshop discovery and booking use narrow RPCs", () => {
  assert.match(migration, /create function public\.search_public_workshops/i);
  assert.match(migration, /create function public\.get_public_workshop_services/i);
  assert.match(migration, /create function public\.create_public_service_booking_request/i);
  assert.match(migration, /security definer[\s\S]+?set search_path = ''/i);
  assert.match(migration, /grant execute on function public\.search_public_workshops\(text\) to anon, authenticated/i);
  assert.match(migration, /revoke all on table public\.service_booking_requests from public, anon, authenticated/i);
  assert.match(requestAction, /randomBytes\(32\)/i);
  assert.match(requestAction, /createHash\("sha256"\)/i);
});

test("the customer journey stays request-to-book until workshop confirmation", () => {
  assert.match(migration, /'requested',[\s\S]+?'confirmed'/i);
  assert.match(migration, /status <> 'confirmed' or confirmed_start is not null/i);
  assert.match(home, /only booked after the workshop confirms it/i);
  assert.match(requestFlow, /This is a request, not a confirmed appointment yet/i);
  assert.match(requestFlow, /preferredStart/i);
  assert.match(requestFlow, /alternateStart/i);
});

test("provider price is EUR 35 monthly with SMS included and no usage surcharge", () => {
  assert.match(migration, /monthly_price_cents[\s\S]+?3500/i);
  assert.match(migration, /'EUR', true/i);
  assert.match(migration, /values \(date_trunc\('month', current_date\)::date, 3500, 0\)/i);
  assert.match(home, /€35/i);
  assert.match(home, /SMS included/i);
});

test("My Garage stores reusable vehicles and displays service request history", () => {
  assert.match(garage, /My Garage/i);
  assert.match(garage, /addVehicleAction/i);
  assert.match(garage, /Bookings and service history/i);
  assert.match(garageDal, /from\("vehicles"\)/i);
  assert.match(garageDal, /from\("service_booking_requests"\)/i);
  assert.match(garageDal, /customer_id/i);
});
