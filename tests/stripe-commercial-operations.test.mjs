import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608070032_stripe_provider_commercial_operations.sql");
const stripeServer = await read("lib/stripe/server.ts");
const webhook = await read("app/api/stripe/webhook/route.ts");
const actions = await read("app/workshop-manager/invoicing/actions.ts");
const providerPage = await read("app/workshop-manager/invoicing/ProviderBillingClient.tsx");
const adminPage = await read("app/admin/invoicing/CommercialAdminClient.tsx");
const exportRoute = await read("app/api/billing-export/route.ts");

test("commercial schema is automotive-owned and RLS protected", () => {
  for (const table of ["service_provider_billing_profiles", "provider_subscriptions", "provider_invoices", "stripe_webhook_receipts", "service_provider_status_history"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`, "i"));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(migration, /revoke all on table public\.service_provider_billing_profiles,[\s\S]+from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all) on table public\.(?:provider_subscriptions|provider_invoices|stripe_webhook_receipts)[^;]+authenticated/i);
});

test("only owners can initiate provider billing and payment never directly changes access", () => {
  assert.match(migration, /membership\.membership_role = 'owner'/i);
  assert.match(migration, /manager\.auth_user_id = \(select auth\.uid\(\)\)/i);
  assert.match(actions, /loadProviderBilling/i);
  assert.match(actions, /mode: "subscription"/i);
  assert.match(actions, /price\.unit_amount !== billing\.plan\.monthlyPriceCents/i);
  assert.match(actions, /price\.recurring\?\.interval !== "month"/i);
  assert.match(actions, /subscription_data: \{ metadata: \{ service_provider_id/i);
  assert.match(migration, /grant execute on function public\.attach_provider_stripe_customer\(uuid, text\) to service_role/i);
  assert.doesNotMatch(migration, /grant execute on function public\.attach_provider_stripe_customer[^;]+authenticated/i);
  const subscriptionFunction = migration.match(/create function public\.apply_stripe_subscription_event[\s\S]+?\n\$\$;/i)?.[0] ?? "";
  assert.doesNotMatch(subscriptionFunction, /update public\.(?:service_providers|workshops|workshop_manager_profiles)/i);
  assert.match(migration, /create trigger service_providers_initialize_commercial_records/i);
});

test("signed Stripe webhooks are normalized into idempotent service-role RPCs", () => {
  assert.match(stripeServer, /STRIPE_WEBHOOK_SECRET/i);
  assert.match(webhook, /request\.text\(\)/i);
  assert.match(webhook, /stripe-signature[\s\S]+constructEvent/i);
  const serviceGrant = migration.match(/grant execute on function public\.apply_stripe_checkout_event[\s\S]+?to service_role;/i)?.[0] ?? "";
  for (const rpc of ["apply_stripe_checkout_event", "apply_stripe_subscription_event", "apply_stripe_invoice_event"]) {
    assert.match(migration, new RegExp(`create function public\\.${rpc}`, "i"));
    assert.match(serviceGrant, new RegExp(`public\\.${rpc}`, "i"));
    assert.match(webhook, new RegExp(rpc, "i"));
  }
  assert.match(migration, /on conflict \(stripe_event_id\) do nothing/i);
  assert.doesNotMatch(migration, /raw_payload|card_number|payment_method_details/i);
});

test("provider workspace exposes Stripe Checkout, portal, profile, and invoices", () => {
  assert.match(providerPage, /startStripeCheckoutAction/i);
  assert.match(providerPage, /openStripePortalAction/i);
  assert.match(providerPage, /updateProviderBillingProfileAction/i);
  assert.match(providerPage, /hostedInvoiceUrl/i);
  assert.match(providerPage, /invoicePdfUrl/i);
});

test("commercial admins get MFA-scoped reporting, export, and audited operations", () => {
  assert.match(migration, /private\.has_accounting_access/i);
  assert.match(migration, /auth\.jwt\(\)->>'aal'\) = 'aal2'/i);
  assert.match(migration, /create function public\.get_provider_commercial_admin/i);
  assert.match(migration, /create function public\.set_admin_service_provider_status/i);
  assert.match(migration, /insert into public\.service_provider_status_history/i);
  assert.match(adminPage, /monthlyRecurringCents/i);
  assert.match(adminPage, /StatusForm/i);
  assert.match(exportRoute, /scope === "commercial"/i);
});
