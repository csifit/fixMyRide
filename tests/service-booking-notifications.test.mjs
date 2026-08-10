import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608080035_service_booking_lifecycle_notifications.sql");
const messages = await read("lib/sms/service-booking-message.ts");
const dispatcher = await read("lib/sms/service-booking-notifications.ts");
const requestActions = await read("app/workshop-manager/requests/actions.ts");
const repairActions = await read("app/workshop-manager/repairs/actions.ts");
const cron = await read("app/api/cron/service-booking-notifications/route.ts");
const { serviceBookingMessage, SERVICE_BOOKING_SMS_MAX_LENGTH } = await import("../lib/sms/service-booking-message.ts");

const expectedKinds = [
  "booking_confirmed",
  "reminder_24h",
  "repair_started",
  "ready_for_pickup",
  "review_request",
];

test("service bookings define exactly the five approved SMS lifecycle events", () => {
  const enumBody = migration.match(/create type public\.service_booking_notification_kind as enum \(([\s\S]*?)\);/i)?.[1] ?? "";
  const kinds = [...enumBody.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(kinds, expectedKinds);
  assert.match(migration, /unique \(booking_request_id, kind\)/i);
  assert.match(migration, /on conflict \(booking_request_id, kind\) do nothing/gi);
});

test("every localized service-booking SMS is hard capped at 150 characters", () => {
  assert.equal(SERVICE_BOOKING_SMS_MAX_LENGTH, 150);
  assert.match(messages, /SERVICE_BOOKING_SMS_MAX_LENGTH = 150/);
  assert.match(messages, /return clean\(copy\[input\.locale\]\[input\.notification_kind\], SERVICE_BOOKING_SMS_MAX_LENGTH\)/);
  for (const locale of ["en", "de", "ro", "hu"]) {
    assert.match(messages, new RegExp(`\\n    ${locale}: \\{`));
    for (const notification_kind of expectedKinds) {
      const message = serviceBookingMessage({
        notification_kind,
        locale,
        workshop_name: "Very long workshop name ".repeat(8),
        vehicle_registration: "REGISTRATION-1234567890",
        confirmed_start: "2026-08-10T10:00:00Z",
        timezone: "Europe/Bucharest",
      });
      assert.ok(message.length <= 150, `${locale}/${notification_kind}: ${message.length}`);
    }
  }
  for (const kind of expectedKinds) assert.ok(messages.includes(`${kind}:`), kind);
});

test("database trigger queues status events and reschedules only an unsent reminder", () => {
  assert.match(migration, /after insert or update of status, confirmed_start, customer_phone/i);
  assert.match(migration, /new\.status = 'confirmed'[\s\S]+?'booking_confirmed'/i);
  assert.match(migration, /new\.confirmed_start - interval '24 hours'/i);
  assert.match(migration, /where service_booking_notifications\.status <> 'sent'/i);
  assert.match(migration, /new\.status = 'in_service'[\s\S]+?'repair_started'/i);
  assert.match(migration, /new\.status = 'ready_for_collection'[\s\S]+?'ready_for_pickup'/i);
  assert.match(migration, /new\.status = 'completed'[\s\S]+?'review_request'/i);
});

test("notification operations are service-role only, retryable, and lifecycle aware", () => {
  assert.match(migration, /attempt_count < 5/i);
  assert.match(migration, /for update of notification skip locked/i);
  assert.match(migration, /status = 'processing'[\s\S]+?attempt_count = notification\.attempt_count \+ 1/i);
  assert.match(migration, /grant execute on function public\.claim_due_service_booking_notifications[\s\S]+?to service_role/i);
  assert.doesNotMatch(migration, /grant execute on function public\.claim_due_service_booking_notifications[\s\S]+?to authenticated/i);
  assert.match(dispatcher, /sendSmsLinkMessage/);
  assert.match(dispatcher, /complete_service_booking_notification/);
});

test("immediate actions and the protected cron dispatch queued booking messages", () => {
  assert.match(requestActions, /dispatchDueServiceBookingNotifications/);
  assert.match(repairActions, /dispatchDueServiceBookingNotifications/);
  assert.match(cron, /dispatchDueServiceBookingNotifications/);
  assert.doesNotMatch(cron, /Appointment|appointment/);
  assert.match(cron, /authorization/);
});
