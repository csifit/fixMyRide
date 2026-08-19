import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [migration, requestAction, accessRoute, accessActions, accessClient, dispatcher, cron, workshopInbox, customerBookings, css, en, de, ro, hu, vercel] = await Promise.all([
  read("supabase/migrations/202608190070_workshop_customer_messaging_foundation.sql"),
  read("app/workshops/[workshopId]/request/actions.ts"),
  read("app/customer/booking-access/activate/route.ts"),
  read("app/customer/booking-access/actions.ts"),
  read("app/customer/booking-access/BookingAccessClient.tsx"),
  read("lib/messaging/booking-communications.ts"),
  read("app/api/cron/service-booking-notifications/route.ts"),
  read("app/workshop-manager/requests/WorkshopBookingInboxClient.tsx"),
  read("app/customer/bookings/CustomerBookingsClient.tsx"),
  read("app/globals.css"),
  read("app/i18n/en.json"), read("app/i18n/de.json"), read("app/i18n/ro.json"), read("app/i18n/hu.json"),
  read("vercel.json"),
]);

test("anonymous bookings receive a private expiring access link", () => {
  assert.match(migration, /management_token_expires_at timestamptz/i);
  assert.match(migration, /get_booking_access_session\(requested_token_digest text\)/i);
  assert.match(migration, /manage_booking_with_access_token/i);
  assert.match(migration, /decide_estimate_with_access_token/i);
  assert.match(migration, /grant execute on function public\.get_booking_access_session\(text\) to service_role/i);
  assert.match(requestAction, /sendBookingAccessEmail/);
  assert.match(accessRoute, /httpOnly:\s*true/);
  assert.match(accessRoute, /sameSite:\s*"lax"/);
  assert.match(accessRoute, /BOOKING_ACCESS_COOKIE/);
  assert.match(accessActions, /readBookingAccessDigest/);
  assert.match(accessClient, /accept_proposal/);
  assert.match(accessClient, /estimate\.id/);
});

test("communication events are channel-neutral, private, and retryable", () => {
  for (const table of ["booking_communication_events", "booking_communication_deliveries", "booking_communication_reads"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`, "i"));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"));
  }
  for (const channel of ["in_app", "email", "sms", "whatsapp"]) assert.match(migration, new RegExp(`'${channel}'`));
  assert.match(migration, /attempt_count < 5/i);
  assert.match(migration, /skip locked/i);
  assert.match(migration, /get_admin_booking_communication_summary/i);
  assert.match(migration, /'exhausted'.*attempt_count >= 5/is);
});

test("every action that needs attention produces an event and delivery", () => {
  for (const event of ["appointment_proposed", "booking_rescheduled", "booking_declined", "booking_cancelled", "proposal_accepted", "proposal_declined", "customer_cancelled", "estimate_ready", "estimate_approved", "estimate_declined"]) {
    assert.match(migration, new RegExp(`'${event}'`));
  }
  assert.match(dispatcher, /claim_due_booking_communication_deliveries/);
  assert.match(dispatcher, /sendTransactionalEmail/);
  assert.match(dispatcher, /sendSmsLinkMessage/);
  assert.match(cron, /dispatchDueBookingCommunications/);
  assert.match(vercel, /service-booking-notifications/);
});

test("customer-visible messages and internal workshop notes are separated", () => {
  assert.match(migration, /customer_visible_workshop_message text/i);
  assert.match(migration, /internal_workshop_note text/i);
  assert.match(migration, /customer_visible_workshop_message = case[\s\S]*?then null[\s\S]*?internal_workshop_note = case/i);
  assert.match(migration, /private\.separate_service_booking_notes/i);
  assert.match(migration, /'note', case when history\.action::text in \([\s\S]*?'work_started'[\s\S]*?then null else history\.note end/i);
  assert.doesNotMatch(migration, /coalesce\(booking\.customer_visible_workshop_message, booking\.workshop_note\)/i);
  assert.match(migration, /service_name, latest_estimate\.total_cents/i);
  assert.match(workshopInbox, /phase7\.messaging\.customerVisibleHelp/);
  assert.doesNotMatch(accessClient, /internalWorkshopNote|internal_workshop_note/);
});

test("both roles receive unread communication indicators", () => {
  assert.match(migration, /get_my_booking_communication_counts/i);
  assert.match(migration, /get_managed_booking_communication_counts/i);
  assert.match(migration, /booking_communication_reads/i);
  assert.match(workshopInbox, /unreadCommunicationCount/);
  assert.match(customerBookings, /unreadCommunicationCount/);
  assert.match(workshopInbox, /markWorkshopBookingReadAction/);
  assert.match(customerBookings, /markCustomerBookingReadAction/);
});

test("new phone numbers are normalized and constrained to E.164", () => {
  assert.match(requestAction, /normalizeInternationalPhone/);
  assert.match(migration, /customer_phone ~ '\^\\\+\[1-9\]\[0-9\]\{7,14\}\$'/i);
});

test("Phase 7 translations have exact parity and readable styling", () => {
  const dictionaries = [en, de, ro, hu].map(JSON.parse);
  const keys = Object.keys(dictionaries[0]).sort();
  for (const dictionary of dictionaries.slice(1)) assert.deepEqual(Object.keys(dictionary).sort(), keys);
  assert.ok(keys.filter((key) => key.startsWith("phase7.")).length >= 25);
  const phaseSevenCss = css.split("/* Workshop-customer messaging — Phase 7 */")[1] ?? "";
  assert.doesNotMatch(phaseSevenCss, /font-size:\s*[0-9](?:px)?\b/);
  assert.doesNotMatch(phaseSevenCss, /font-weight:\s*(?:[5-9]00|bold)/);
});
