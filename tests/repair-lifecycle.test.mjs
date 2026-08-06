import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const enumMigration = await read("supabase/migrations/202608070030_repair_lifecycle_history_actions.sql");
const migration = await read("supabase/migrations/202608070031_repair_lifecycle.sql");
const managerDal = await read("lib/dal/repair-workflows.ts");
const managerActions = await read("app/workshop-manager/repairs/actions.ts");
const managerClient = await read("app/workshop-manager/repairs/WorkshopRepairsClient.tsx");
const customerDal = await read("lib/dal/customer-bookings.ts");
const customerClient = await read("app/customer/bookings/CustomerBookingsClient.tsx");

test("repair history enum additions commit before lifecycle functions use them", () => {
  for (const action of ["checked_in", "diagnosis_recorded", "estimate_sent", "estimate_approved", "estimate_declined", "work_started", "ready_for_collection", "completed", "no_show"]) {
    assert.match(enumMigration, new RegExp(`add value if not exists '${action}'`, "i"));
    assert.match(migration, new RegExp(`'${action}'`, "i"));
  }
  assert.doesNotMatch(enumMigration, /create function/i);
});

test("estimates are versioned, itemized, server-totalled, and not directly writable", () => {
  assert.match(migration, /create table public\.repair_estimates/i);
  assert.match(migration, /unique \(booking_request_id, version\)/i);
  assert.match(migration, /generated always as[\s\S]+labor_cents \+ parts_cents \+ other_cents/i);
  assert.match(migration, /create table public\.repair_estimate_items/i);
  assert.match(migration, /line_total_cents = round\(quantity \* unit_price_cents\)/i);
  assert.match(migration, /enable row level security/i);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete) on table public\.repair_estimate/i);
});

test("manager transitions are authorized, locked, and strictly ordered", () => {
  assert.match(migration, /create function public\.manage_repair_workflow/i);
  assert.match(migration, /manager\.auth_user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /for update of booking/i);
  assert.match(migration, /status <> 'confirmed'[\s\S]+status = 'checked_in'/i);
  assert.match(migration, /status <> 'checked_in'[\s\S]+status = 'diagnosing'/i);
  assert.match(migration, /latest_estimate\.status <> 'approved'/i);
  assert.match(migration, /status <> 'in_service'[\s\S]+status = 'ready_for_collection'/i);
  assert.match(migration, /status <> 'ready_for_collection'[\s\S]+status = 'completed'/i);
});

test("customer decision is ownership-scoped and leaves work start to the workshop", () => {
  assert.match(migration, /create function public\.decide_my_repair_estimate/i);
  assert.match(migration, /customer\.auth_user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /for update of estimate, booking/i);
  assert.match(migration, /requested_decision = 'approve'[\s\S]+status = 'approved'/i);
  assert.match(migration, /requested_decision = 'decline'[\s\S]+status = 'diagnosing'/i);
  const approveBranch = migration.match(/if requested_decision = 'approve' then([\s\S]+?)elsif requested_decision = 'decline'/i)?.[1] ?? "";
  assert.doesNotMatch(approveBranch, /service_booking_requests set status = 'in_service'/i);
});

test("manager and customer interfaces expose their respective lifecycle controls", () => {
  assert.match(managerDal, /get_managed_repair_workflows/i);
  assert.match(managerActions, /submit_estimate/i);
  assert.match(managerClient, /kind="check_in"/i);
  assert.match(managerClient, /kind="start_work"/i);
  assert.match(managerClient, /kind="ready_for_collection"/i);
  assert.match(customerDal, /get_my_repair_estimates/i);
  assert.match(customerDal, /decide_my_repair_estimate/i);
  assert.match(customerClient, /decision="approve"/i);
  assert.match(customerClient, /decision="decline"/i);
});
