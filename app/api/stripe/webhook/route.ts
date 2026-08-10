import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const timestamp = (value: number | null | undefined) => value ? new Date(value * 1000).toISOString() : null;
const identifier = (value: string | { id: string } | null | undefined) => typeof value === "string" ? value : value?.id ?? null;

async function applyCheckout(event: Stripe.Event, session: Stripe.Checkout.Session) {
  const providerId = session.metadata?.service_provider_id ?? session.client_reference_id;
  const workshopId = session.metadata?.workshop_id;
  const customerId = identifier(session.customer);
  const subscriptionId = identifier(session.subscription);
  if (!providerId || !customerId || !subscriptionId) throw new Error("stripe_checkout_metadata_missing");
  if (workshopId) return createServiceClient().rpc("apply_stripe_location_checkout_event", {
    requested_event_id: event.id, requested_event_type: event.type,
    requested_event_created_at: timestamp(event.created), requested_livemode: event.livemode,
    requested_api_version: event.api_version, requested_provider_id: providerId,
    requested_workshop_id: workshopId, requested_customer_id: customerId,
    requested_subscription_id: subscriptionId,
  });
  return createServiceClient().rpc("apply_stripe_checkout_event", {
    requested_event_id: event.id, requested_event_type: event.type,
    requested_event_created_at: timestamp(event.created), requested_livemode: event.livemode,
    requested_api_version: event.api_version, requested_provider_id: providerId,
    requested_customer_id: customerId, requested_subscription_id: subscriptionId,
  });
}

async function applySubscription(event: Stripe.Event, subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  const workshopId = subscription.metadata.workshop_id || null;
  if (workshopId) return createServiceClient().rpc("apply_stripe_location_subscription_event", {
    requested_event_id: event.id, requested_event_type: event.type,
    requested_event_created_at: timestamp(event.created), requested_livemode: event.livemode,
    requested_api_version: event.api_version,
    requested_provider_id: subscription.metadata.service_provider_id || null,
    requested_workshop_id: workshopId,
    requested_customer_id: identifier(subscription.customer), requested_subscription_id: subscription.id,
    requested_price_id: item?.price.id ?? null, requested_status: subscription.status,
    requested_period_start: timestamp(item?.current_period_start),
    requested_period_end: timestamp(item?.current_period_end),
    requested_cancel_at_period_end: subscription.cancel_at_period_end,
    requested_canceled_at: timestamp(subscription.canceled_at),
  });
  return createServiceClient().rpc("apply_stripe_subscription_event", {
    requested_event_id: event.id, requested_event_type: event.type,
    requested_event_created_at: timestamp(event.created), requested_livemode: event.livemode,
    requested_api_version: event.api_version,
    requested_provider_id: subscription.metadata.service_provider_id || null,
    requested_customer_id: identifier(subscription.customer), requested_subscription_id: subscription.id,
    requested_price_id: item?.price.id ?? null, requested_status: subscription.status,
    requested_period_start: timestamp(item?.current_period_start),
    requested_period_end: timestamp(item?.current_period_end),
    requested_cancel_at_period_end: subscription.cancel_at_period_end,
    requested_canceled_at: timestamp(subscription.canceled_at),
  });
}

async function applyInvoice(event: Stripe.Event, invoice: Stripe.Invoice) {
  const subscription = invoice.parent?.type === "subscription_details"
    ? invoice.parent.subscription_details?.subscription : null;
  if (!invoice.status) return { error: null };
  return createServiceClient().rpc("apply_stripe_invoice_event", {
    requested_event_id: event.id, requested_event_type: event.type,
    requested_event_created_at: timestamp(event.created), requested_livemode: event.livemode,
    requested_api_version: event.api_version, requested_customer_id: identifier(invoice.customer),
    requested_subscription_id: identifier(subscription), requested_invoice_id: invoice.id,
    requested_invoice_number: invoice.number, requested_status: invoice.status,
    requested_currency: invoice.currency, requested_amount_due: invoice.amount_due,
    requested_amount_paid: invoice.amount_paid, requested_hosted_url: invoice.hosted_invoice_url,
    requested_pdf_url: invoice.invoice_pdf, requested_period_start: timestamp(invoice.period_start),
    requested_period_end: timestamp(invoice.period_end), requested_due_at: timestamp(invoice.due_date),
    requested_paid_at: timestamp(invoice.status_transitions.paid_at),
  });
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new NextResponse("Missing Stripe signature", { status: 400 });
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, getStripeWebhookSecret());
  } catch {
    return new NextResponse("Invalid Stripe signature", { status: 400 });
  }
  try {
    let result: { error: { message?: string } | null } = { error: null };
    if (event.type === "checkout.session.completed") result = await applyCheckout(event, event.data.object);
    else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed"].includes(event.type)) result = await applySubscription(event, event.data.object as Stripe.Subscription);
    else if (["invoice.created", "invoice.finalized", "invoice.paid", "invoice.payment_failed", "invoice.voided", "invoice.marked_uncollectible"].includes(event.type)) result = await applyInvoice(event, event.data.object as Stripe.Invoice);
    if (result.error) throw new Error(result.error.message ?? "stripe_event_persistence_failed");
    return NextResponse.json({ received: true });
  } catch {
    return new NextResponse("Stripe event processing failed", { status: 500 });
  }
}
