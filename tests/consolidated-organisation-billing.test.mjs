import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608110053_consolidated_organisation_billing.sql");
const actions = await read("app/workshop-manager/invoicing/actions.ts");
const webhook = await read("app/api/stripe/webhook/route.ts");
const ownerClient = await read("app/workshop-manager/invoicing/ProviderBillingClient.tsx");
const adminClient = await read("app/admin/invoicing/CommercialAdminClient.tsx");

test("one licensed Stripe subscription consolidates all organisation locations", () => {
  assert.match(migration, /stripe_subscription_item_id/);
  assert.match(migration, /billing_quantity integer not null default 0/);
  assert.match(actions, /price\.recurring\.usage_type !== "licensed"/);
  assert.match(actions, /quantity: targetQuantity/);
  assert.match(actions, /items: \[\{ id: item\.id, quantity: targetQuantity \}\]/);
  assert.match(actions, /proration_behavior: "none"/);
  assert.doesNotMatch(actions, /subscription_data:[\s\S]{0,180}workshop_id/);
});

test("location activation is free until the first of the next month", () => {
  assert.match(actions, /Date\.UTC\([\s\S]+getUTCMonth\(\) \+ 1, 1/);
  assert.match(actions, /billing_cycle_anchor: nextMonthStart/);
  assert.match(migration, /billable_from = coalesce\([\s\S]+interval '1 month'/);
  assert.match(migration, /coverage_started_at = coalesce\([\s\S]+now\(\)/);
  assert.match(ownerClient, /freeUntilNextMonth/);
});

test("failed organisation payments retain coverage for one 15-day grace window", () => {
  assert.match(migration, /invoice\.payment_failed/);
  assert.match(migration, /coalesce\([\s\S]+payment_grace_ends_at[\s\S]+interval '15 days'/);
  assert.match(migration, /payment_grace_ends_at > now\(\)/);
  assert.match(migration, /requested_status in \('past_due', 'unpaid'\)/);
  assert.match(webhook, /invoice\.payment_failed/);
  assert.match(ownerClient, /paymentAttentionTitle/);
});

test("the earlier location cutover grace remains available during consolidation", () => {
  assert.match(migration, /coverage_grace_ends_at > now\(\)/);
  assert.match(migration, /when location_billing\.coverage_started_at is null[\s\S]+then 'grace'/);
  assert.match(ownerClient, /\["uncovered", "grace"\]\.includes/);
});

test("admins see upcoming organisation totals and six months of invoice history", () => {
  assert.match(migration, /create or replace function public\.get_provider_commercial_admin/);
  assert.match(migration, /interval '6 months'/);
  assert.match(migration, /'upcomingAmountCents'/);
  assert.match(adminClient, /provider\.upcomingAmountCents/);
  assert.match(adminClient, /provider\.invoices\.map/);
});
