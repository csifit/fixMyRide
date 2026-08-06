import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608060025_workshop_booking_request_management.sql");
const dal = await read("lib/dal/workshop-bookings.ts");
const actions = await read("app/workshop-manager/requests/actions.ts");
const client = await read("app/workshop-manager/requests/WorkshopBookingInboxClient.tsx");
const portal = await read("app/organization/OrganizationPortalClient.tsx");

test("booking inbox RPCs authorize active workshop managers through the automotive model", () => {
  assert.match(migration, /join public\.workshop_manager_memberships/i);
  assert.match(migration, /membership\.membership_role in \('owner', 'manager'\)/i);
  assert.match(migration, /manager\.auth_user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /create function public\.get_managed_service_booking_requests/i);
  assert.match(migration, /create function public\.manage_service_booking_request/i);
  assert.doesNotMatch(migration, /grant execute on function public\.manage_service_booking_request[^;]+to anon/i);
});

test("management actions lock requests and enforce lifecycle transitions", () => {
  assert.match(migration, /authorization and row locking share one statement/i);
  assert.match(migration, /select booking as booking_record, manager\.id as manager_id\s+into authorized/i);
  assert.doesNotMatch(migration, /into booking_row, manager_id/i);
  assert.match(migration, /for update of booking/i);
  for (const action of ["confirm", "propose_time", "reschedule", "decline", "cancel"]) {
    assert.match(migration, new RegExp(`requested_action = '${action}'`, "i"), action);
  }
  assert.match(migration, /requested_start <= now\(\)/i);
  assert.match(migration, /booking_row\.status <> 'requested'/i);
  assert.match(migration, /booking_row\.status <> 'confirmed'/i);
  assert.match(migration, /normalized_note is null/i);
});

test("booking history is append-only and proposals are not confirmations", () => {
  assert.match(migration, /create table public\.service_booking_request_history/i);
  assert.match(migration, /before update or delete on public\.service_booking_request_history/i);
  assert.match(migration, /workshop_proposed_start timestamptz/i);
  const proposalBranch = migration.match(/elsif requested_action = 'propose_time'[\s\S]+?elsif requested_action = 'reschedule'/i)?.[0] ?? "";
  assert.match(proposalBranch, /workshop_proposed_start = requested_start/i);
  assert.doesNotMatch(proposalBranch, /status = 'confirmed'/i);
});

test("workshop managers can reach and operate the localized inbox", () => {
  assert.match(portal, /href="\/workshop-manager\/requests"/i);
  assert.match(dal, /get_managed_service_booking_requests/i);
  assert.match(actions, /z\.object/i);
  assert.match(client, /useLanguage/i);
  assert.match(client, /kind="confirm"/i);
  assert.match(client, /kind="propose_time"/i);
  assert.match(client, /kind="decline"/i);
});
