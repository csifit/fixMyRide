import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608110042_location_stripe_billing_cutover.sql");
const consolidation = await read("supabase/migrations/202608110053_consolidated_organisation_billing.sql");
const foundation = await read("supabase/migrations/202608100039_location_organisation_foundation.sql");
const actions = await read("app/workshop-manager/invoicing/actions.ts");
const webhook = await read("app/api/stripe/webhook/route.ts");
const client = await read("app/workshop-manager/invoicing/ProviderBillingClient.tsx");
const admin = await read("app/admin/invoicing/CommercialAdminClient.tsx");
const exportRoute = await read("app/api/billing-export/route.ts");
const managerPage = await read("app/workshop-manager/invoicing/page.tsx");

test("covered organisation subscriptions receive a time-bounded safe migration grace", () => {
  assert.match(migration, /provider_subscription\.status in \('active', 'trialing'\)/);
  assert.match(migration, /now\(\) \+ interval '30 days'/);
  assert.match(migration, /coalesce\(provider_subscription\.current_period_end/);
  assert.match(migration, /migration_grace_granted_at = now\(\)/);
  assert.match(migration, /migrated_from_provider_subscription_id/);
  assert.doesNotMatch(migration, /insert into public\.workshop_subscriptions[\s\S]+provider_subscription\.stripe_subscription_id/i);
});

test("legacy location subscriptions remain readable during organisation consolidation", () => {
  assert.match(migration, /create or replace function public\.attach_provider_stripe_customer/);
  assert.match(migration, /insert into public\.service_provider_stripe_customers/);
  assert.match(migration, /create function public\.apply_stripe_location_checkout_event/);
  assert.match(migration, /create function public\.apply_stripe_location_subscription_event/);
  assert.match(migration, /update public\.workshop_subscriptions/);
  assert.match(foundation, /create table public\.workshop_subscriptions[\s\S]+stripe_subscription_id text unique/i);
  assert.match(migration, /grant execute on function public\.apply_stripe_location_checkout_event[\s\S]+to service_role/);
  assert.match(consolidation, /Compatibility for subscriptions created before consolidation/);
  assert.match(consolidation, /location_billing\.stripe_subscription_id is not null/);
});

test("organisation Checkout activates a location now and bills it from next month", () => {
  assert.match(actions, /workshopId: z\.uuid\(\)/);
  assert.match(actions, /payment_method_collection: "always"/);
  assert.match(actions, /activation_workshop_id: location\.workshopId/);
  assert.match(actions, /line_items: \[\{ price: priceId, quantity: targetQuantity \}\]/);
  assert.match(actions, /billing_cycle_anchor: nextMonthStart/);
  assert.match(actions, /proration_behavior: "none"/);
  assert.match(consolidation, /billable_from[\s\S]+date_trunc\('month',[\s\S]+interval '1 month'/);
  assert.match(client, /billing\.locations\.map/);
  assert.match(client, /activateLocation/);
});

test("signed webhooks keep legacy events compatible and route new events by workshop", () => {
  assert.match(webhook, /apply_stripe_location_checkout_event/);
  assert.match(webhook, /apply_stripe_location_subscription_event/);
  assert.match(webhook, /apply_stripe_checkout_event/);
  assert.match(webhook, /apply_stripe_organisation_subscription_event/);
  assert.match(migration, /resolved_workshop_id/);
  assert.match(migration, /workshop_id = excluded\.workshop_id/);
  assert.match(migration, /invoice customer does not match the organisation/i);
});

test("billing is owner-only and reporting is organisation scoped", () => {
  assert.match(managerPage, /redirect\("\/service-organisation\/billing"\)/);
  assert.match(consolidation, /'providers', coalesce\(jsonb_agg/);
  assert.match(consolidation, /upcomingAmountCents/);
  assert.match(consolidation, /interval '6 months'/);
  assert.match(admin, /data\.providers/);
  assert.match(exportRoute, /for \(const provider of data\.providers\)/);
  assert.match(exportRoute, /pitster-organisation-billing/);
});
