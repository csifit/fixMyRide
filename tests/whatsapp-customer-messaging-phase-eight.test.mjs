import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [migration, sender, webhook, dispatcher, requestAction, requestFlow, customer, workshop, guest, admin, css, env, en, de, ro, hu] = await Promise.all([
  read("supabase/migrations/202608200071_whatsapp_customer_messaging.sql"),
  read("lib/whatsapp/cloud-api.ts"),
  read("app/api/webhooks/whatsapp/route.ts"),
  read("lib/messaging/booking-communications.ts"),
  read("app/workshops/[workshopId]/request/actions.ts"),
  read("app/workshops/[workshopId]/request/ServiceRequestFlow.tsx"),
  read("app/customer/bookings/CustomerBookingsClient.tsx"),
  read("app/workshop-manager/requests/WorkshopBookingInboxClient.tsx"),
  read("app/customer/booking-access/BookingAccessClient.tsx"),
  read("app/admin/AdminDashboardClient.tsx"),
  read("app/globals.css"), read(".env.example"),
  read("app/i18n/en.json"), read("app/i18n/de.json"), read("app/i18n/ro.json"), read("app/i18n/hu.json"),
]);

test("WhatsApp is explicit, booking-scoped operational consent", () => {
  assert.match(migration, /whatsapp_opt_in_at timestamptz/i);
  assert.match(migration, /whatsapp_opt_out_at timestamptz/i);
  assert.match(migration, /'public_request', 'customer_account', 'booking_access', 'customer_message'/i);
  assert.match(migration, /marketing consent is deliberately not collected/i);
  assert.match(requestAction, /whatsappOptIn/);
  assert.match(requestFlow, /phase8\.optIn\.label/);
  assert.match(migration, /set_my_booking_whatsapp_preference/i);
  assert.match(migration, /set_booking_whatsapp_preference_with_access_token/i);
});

test("Meta Cloud API supports approved templates and 24-hour session replies", () => {
  assert.match(sender, /graph\.facebook\.com/);
  assert.match(sender, /authorization: `Bearer/);
  assert.match(sender, /type: "template"/);
  assert.match(sender, /type: "text"/);
  assert.match(sender, /4096/);
  assert.match(dispatcher, /sendWhatsAppTemplate/);
  assert.match(dispatcher, /sendWhatsAppSessionText/);
  assert.match(migration, /whatsapp_last_inbound_at <= now\(\) - interval '24 hours'/i);
  assert.match(workshop, /replyWindowOpen/);
});

test("signed webhooks record inbound messages, opt-outs, and delivery receipts", () => {
  assert.match(webhook, /x-hub-signature-256/i);
  assert.match(webhook, /createHmac\("sha256"/);
  assert.match(webhook, /timingSafeEqual/);
  assert.match(webhook, /hub\.verify_token/);
  assert.match(webhook, /whatsapp_business_account/);
  assert.match(webhook, /recordWhatsAppInbound/);
  assert.match(webhook, /recordWhatsAppStatus/);
  assert.match(migration, /record_whatsapp_inbound_message/i);
  assert.match(migration, /'stop', 'unsubscribe'/i);
  assert.match(migration, /record_whatsapp_delivery_status/i);
  assert.match(migration, /requested_status = 'failed' then 5 else attempt_count/i);
});

test("conversation content is private and SMS is fallback rather than duplicate delivery", () => {
  assert.match(migration, /create table public\.booking_whatsapp_messages/i);
  assert.match(migration, /alter table public\.booking_whatsapp_messages enable row level security/i);
  assert.match(migration, /revoke all on table public\.booking_whatsapp_messages from public, anon, authenticated/i);
  assert.match(migration, /not private\.booking_whatsapp_enabled\(booking\)/i);
  assert.match(migration, /completed\.message_mode = 'template'.*attempt_count >= 5/is);
  assert.match(migration, /requested_status = 'failed'.*channel, destination/is);
  assert.match(migration, /when 'sent' then 2 when 'delivered' then 3 when 'read' then 4/i);
  assert.match(migration, /get_managed_booking_whatsapp_state/i);
  assert.match(migration, /get_my_booking_whatsapp_state/i);
});

test("customer, guest, workshop, and admin surfaces expose scoped WhatsApp controls", () => {
  assert.match(customer, /setCustomerWhatsAppPreferenceAction/);
  assert.match(customer, /booking-whatsapp-thread/);
  assert.match(guest, /setGuestWhatsAppPreferenceAction/);
  assert.match(workshop, /sendWorkshopWhatsAppReplyAction/);
  assert.match(workshop, /maxLength=\{4096\}/);
  assert.match(admin, /data\.whatsapp\.delivered/);
  assert.match(admin, /phase8\.admin\.smsFallback/);
});

test("Phase 8 configuration, translations, and typography are complete", () => {
  for (const key of ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_GRAPH_API_VERSION", "WHATSAPP_TEMPLATE_BOOKING_UPDATE", "WHATSAPP_WEBHOOK_VERIFY_TOKEN", "WHATSAPP_APP_SECRET"]) {
    assert.match(env, new RegExp(`^${key}=`, "m"));
  }
  const dictionaries = [en, de, ro, hu].map(JSON.parse);
  const keys = Object.keys(dictionaries[0]).sort();
  for (const dictionary of dictionaries.slice(1)) assert.deepEqual(Object.keys(dictionary).sort(), keys);
  assert.ok(keys.filter((key) => key.startsWith("phase8.")).length >= 40);
  const phaseEightCss = css.split("/* WhatsApp customer messaging — Phase 8 */")[1] ?? "";
  assert.doesNotMatch(phaseEightCss, /font-size:\s*[0-9](?:px)?\b/);
  assert.doesNotMatch(phaseEightCss, /font-weight:\s*(?:[5-9]00|bold)/);
});
