import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608110042_location_stripe_billing_cutover.sql");
const foundation = await read("supabase/migrations/202608100039_location_organisation_foundation.sql");
const actions = await read("app/workshop-manager/invoicing/actions.ts");
const webhook = await read("app/api/stripe/webhook/route.ts");
const client = await read("app/workshop-manager/invoicing/ProviderBillingClient.tsx");
const admin = await read("app/admin/invoicing/CommercialAdminClient.tsx");
const exportRoute = await read("app/api/billing-export/route.ts");

test("covered organisation subscriptions receive a time-bounded safe migration grace", () => {
  assert.match(migration, /provider_subscription\.status in \('active', 'trialing'\)/);
  assert.match(migration, /now\(\) \+ interval '30 days'/);
  assert.match(migration, /coalesce\(provider_subscription\.current_period_end/);
  assert.match(migration, /migration_grace_granted_at = now\(\)/);
  assert.match(migration, /migrated_from_provider_subscription_id/);
  assert.doesNotMatch(migration, /insert into public\.workshop_subscriptions[\s\S]+provider_subscription\.stripe_subscription_id/i);
});

test("the organisation is the customer while each workshop is the subscription unit", () => {
  assert.match(migration, /create or replace function public\.attach_provider_stripe_customer/);
  assert.match(migration, /insert into public\.service_provider_stripe_customers/);
  assert.match(migration, /create function public\.apply_stripe_location_checkout_event/);
  assert.match(migration, /create function public\.apply_stripe_location_subscription_event/);
  assert.match(migration, /update public\.workshop_subscriptions/);
  assert.match(foundation, /create table public\.workshop_subscriptions[\s\S]+stripe_subscription_id text unique/i);
  assert.match(migration, /grant execute on function public\.apply_stripe_location_checkout_event[\s\S]+to service_role/);
});

test("location Checkout defers its first charge to grace end and carries canonical metadata", () => {
  assert.match(actions, /workshopId: z\.uuid\(\)/);
  assert.match(actions, /trial_end: safeTrialEnd/);
  assert.match(actions, /missing_payment_method: "cancel"/);
  assert.match(actions, /payment_method_collection: "always"/);
  assert.match(actions, /metadata: \{ service_provider_id: billing\.providerId, workshop_id: location\.workshopId \}/);
  assert.match(actions, /line_items: \[\{ price: priceId, quantity: 1 \}\]/);
  assert.match(client, /billing\.locations\.map/);
  assert.match(client, /subscribeLocation/);
});

test("signed webhooks keep legacy events compatible and route new events by workshop", () => {
  assert.match(webhook, /apply_stripe_location_checkout_event/);
  assert.match(webhook, /apply_stripe_location_subscription_event/);
  assert.match(webhook, /apply_stripe_checkout_event/);
  assert.match(webhook, /apply_stripe_subscription_event/);
  assert.match(migration, /resolved_workshop_id/);
  assert.match(migration, /workshop_id = excluded\.workshop_id/);
  assert.match(migration, /invoice customer does not match the organisation/i);
});

test("commercial reporting and exports are location scoped after cutover", () => {
  assert.match(migration, /'locations', coalesce\(jsonb_agg/);
  assert.match(migration, /monthlyRecurringCents[\s\S]+subscription\.status in \('active', 'trialing'\)/);
  assert.match(admin, /data\.locations/);
  assert.match(exportRoute, /for \(const location of data\.locations\)/);
  assert.match(exportRoute, /pitster-location-billing/);
});
