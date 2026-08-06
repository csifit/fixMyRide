import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608070029_workshop_operations.sql");
const dal = await read("lib/dal/workshop-operations.ts");
const actions = await read("app/workshop-manager/workshops/actions.ts");
const client = await read("app/workshop-manager/workshops/WorkshopOperationsClient.tsx");
const publicDal = await read("lib/dal/public-workshops.ts");
const requestFlow = await read("app/workshops/[workshopId]/request/ServiceRequestFlow.tsx");

test("operations schema covers schedules, closures, capacity, and mobility", () => {
  assert.match(migration, /create table public\.workshop_operating_hours/i);
  assert.match(migration, /create table public\.workshop_closures/i);
  for (const field of ["minimum_lead_minutes", "booking_horizon_days", "daily_booking_capacity", "slot_interval_minutes", "allows_wait_on_site"]) assert.match(migration, new RegExp(field, "i"));
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /private\.can_manage_automotive_workshop/i);
});

test("manager mutations are narrow, target-authorized RPCs", () => {
  for (const rpc of ["get_my_workshop_operations", "update_my_workshop_operations", "add_my_workshop_closure", "remove_my_workshop_closure"]) {
    assert.match(migration, new RegExp(`create (?:or replace )?function public\\.${rpc}`, "i"));
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}`, "i"));
  }
  assert.doesNotMatch(migration, /grant (?:insert|update|delete) on table public\.workshop_(?:operating_hours|closures) to authenticated/i);
  assert.match(actions, /z\.object/i);
  assert.match(dal, /get_my_workshop_operations/i);
});

test("public booking enforces real workshop availability under a row lock", () => {
  assert.match(migration, /for update of workshop/i);
  assert.match(migration, /minimum_lead_minutes/i);
  assert.match(migration, /booking_horizon_days/i);
  assert.match(migration, /workshop_operating_hours/i);
  assert.match(migration, /slot_interval_minutes <> 0/i);
  assert.match(migration, /workshop_closures/i);
  assert.match(migration, /requests_on_day >= workshop_row\.daily_booking_capacity/i);
  assert.match(migration, /requested mobility option is unavailable/i);
});

test("public and manager UIs consume canonical operational rules", () => {
  assert.match(client, /updateWorkshopOperationsAction/i);
  assert.match(client, /addWorkshopClosureAction/i);
  assert.match(client, /operatingHours\.map/i);
  assert.match(publicDal, /get_public_workshop_booking_rules/i);
  assert.match(requestFlow, /rules\.slotIntervalMinutes/i);
  assert.match(requestFlow, /rules\.allowsWaitOnSite/i);
});
