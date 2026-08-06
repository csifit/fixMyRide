import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const enumMigration = await read("supabase/migrations/202608060026_customer_booking_history_actions.sql");
const migration = await read("supabase/migrations/202608060027_customer_booking_management.sql");
const dal = await read("lib/dal/customer-bookings.ts");
const actions = await read("app/customer/bookings/actions.ts");
const client = await read("app/customer/bookings/CustomerBookingsClient.tsx");
const garage = await read("app/garage/GarageClient.tsx");

test("customer history enum expansion is isolated before its values are used", () => {
  for (const action of ["proposal_accepted", "proposal_declined", "customer_cancelled"]) {
    assert.match(enumMigration, new RegExp(`add value if not exists '${action}'`, "i"));
    assert.match(migration, new RegExp(`'${action}'`, "i"));
  }
  assert.doesNotMatch(enumMigration, /create function/i);
});

test("customer RPCs authorize ownership and lock mutations", () => {
  assert.match(migration, /create function public\.get_my_service_booking_requests\(\)/i);
  assert.match(migration, /create function public\.manage_my_service_booking_request/i);
  assert.match(migration, /customer\.auth_user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /select booking as booking_record, customer\.id as customer_id\s+into authorized/i);
  assert.match(migration, /for update of booking/i);
  assert.doesNotMatch(migration, /grant execute on function public\.manage_my_service_booking_request[^;]+to anon/i);
});

test("customer actions enforce proposal and future cancellation rules", () => {
  assert.match(migration, /requested_action = 'accept_proposal'/i);
  assert.match(migration, /requested_action = 'decline_proposal'/i);
  assert.match(migration, /requested_action = 'cancel'/i);
  assert.match(migration, /accepted_start is null or accepted_start <= now\(\)/i);
  assert.match(migration, /greatest\([\s\S]+?\) <= now\(\)/i);
  assert.match(migration, /normalized_note is null/i);
  assert.match(migration, /actor_customer_id/i);
});

test("customer dashboard exposes proposal controls and safe workshop details", () => {
  assert.match(dal, /get_my_service_booking_requests/i);
  assert.match(actions, /z\.enum\(\["accept_proposal", "decline_proposal", "cancel"\]\)/i);
  assert.match(client, /actionKind="accept_proposal"/i);
  assert.match(client, /actionKind="decline_proposal"/i);
  assert.match(client, /booking\.workshopPhone/i);
  assert.match(garage, /href="\/customer\/bookings"/i);
});
