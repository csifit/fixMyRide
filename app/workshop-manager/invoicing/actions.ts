"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DataAccessError } from "@/lib/dal/errors";
import { attachProviderStripeCustomer, loadProviderBilling, updateProviderBillingProfile } from "@/lib/dal/provider-billing";
import { getSiteUrl } from "@/lib/site-url";
import { getStripe, getStripeStandardPriceId } from "@/lib/stripe/server";

export type ProviderBillingActionState = { status: "idle" | "saved" | "invalid" | "unauthorized" | "configuration" | "unavailable" };

const providerSchema = z.object({ providerId: z.uuid() });
const checkoutSchema = providerSchema.extend({ workshopId: z.uuid() });
const profileSchema = providerSchema.extend({
  billingEmail: z.union([z.literal(""), z.email().max(320)]),
  billingContact: z.string().trim().max(160), taxIdentifier: z.string().trim().max(80),
  addressLine1: z.string().trim().max(240), addressLine2: z.string().trim().max(240),
  city: z.string().trim().max(120), postalCode: z.string().trim().max(24),
  countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()),
});

function failure(error: unknown): ProviderBillingActionState {
  if (error instanceof DataAccessError) {
    if (error.code === "unauthorized") return { status: "unauthorized" };
    if (error.code === "invalid_input" || error.code === "conflict") return { status: "invalid" };
  }
  if (error instanceof z.ZodError) return { status: "configuration" };
  return { status: "unavailable" };
}

export async function updateProviderBillingProfileAction(_state: ProviderBillingActionState, formData: FormData): Promise<ProviderBillingActionState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  const { providerId, ...values } = parsed.data;
  try {
    await updateProviderBillingProfile(providerId, {
      billingEmail: values.billingEmail || null, billingContact: values.billingContact || null,
      taxIdentifier: values.taxIdentifier || null, addressLine1: values.addressLine1 || null,
      addressLine2: values.addressLine2 || null, city: values.city || null,
      postalCode: values.postalCode || null, countryCode: values.countryCode,
    });
    revalidatePath("/workshop-manager/invoicing");
    revalidatePath("/service-organisation/billing");
    return { status: "saved" };
  } catch (error) { return failure(error); }
}

export async function startStripeCheckoutAction(formData: FormData) {
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/service-organisation/billing?billingError=invalid");
  let checkoutUrl: string;
  try {
    const billing = await loadProviderBilling(parsed.data.providerId);
    const location = billing.locations.find((item) => item.workshopId === parsed.data.workshopId);
    if (!location || (location.stripeSubscriptionId
      && !["incomplete_expired", "canceled"].includes(location.subscriptionStatus))) {
      throw new DataAccessError("conflict");
    }
    const stripe = getStripe();
    const priceId = getStripeStandardPriceId();
    const price = await stripe.prices.retrieve(priceId);
    if (!price.active || price.unit_amount !== billing.plan.monthlyPriceCents
      || price.currency.toUpperCase() !== billing.plan.currency
      || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1) {
      throw new Error("stripe_price_does_not_match_standard_plan");
    }
    let customerId = billing.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: billing.legalName, email: billing.billingProfile.billingEmail ?? undefined,
        address: {
          line1: billing.billingProfile.addressLine1 ?? undefined,
          line2: billing.billingProfile.addressLine2 ?? undefined,
          city: billing.billingProfile.city ?? undefined,
          postal_code: billing.billingProfile.postalCode ?? undefined,
          country: billing.billingProfile.countryCode,
        },
        metadata: { service_provider_id: billing.providerId },
      }, { idempotencyKey: `provider-customer-${billing.providerId}` });
      customerId = customer.id;
      await attachProviderStripeCustomer(billing.providerId, customerId);
    }
    const siteUrl = getSiteUrl();
    const graceEndsAt = location.coverageGraceEndsAt
      ? Math.floor(new Date(location.coverageGraceEndsAt).getTime() / 1000)
      : null;
    const safeTrialEnd = graceEndsAt && graceEndsAt > Math.floor(Date.now() / 1000) + 172_800
      ? graceEndsAt
      : undefined;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription", customer: customerId,
      payment_method_collection: "always",
      line_items: [{ price: priceId, quantity: 1 }],
      billing_address_collection: "required", tax_id_collection: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      client_reference_id: location.workshopId,
      metadata: { service_provider_id: billing.providerId, workshop_id: location.workshopId },
      subscription_data: {
        metadata: { service_provider_id: billing.providerId, workshop_id: location.workshopId },
        trial_end: safeTrialEnd,
        trial_settings: safeTrialEnd
          ? { end_behavior: { missing_payment_method: "cancel" } }
          : undefined,
      },
      success_url: `${siteUrl}/service-organisation/billing?providerId=${billing.providerId}&workshopId=${location.workshopId}&checkout=success`,
      cancel_url: `${siteUrl}/service-organisation/billing?providerId=${billing.providerId}&workshopId=${location.workshopId}&checkout=cancelled`,
    });
    if (!session.url) throw new Error("stripe_checkout_url_missing");
    checkoutUrl = session.url;
  } catch (error) {
    const result = failure(error);
    redirect(`/service-organisation/billing?providerId=${parsed.data.providerId}&billingError=${result.status}`);
  }
  redirect(checkoutUrl);
}

export async function openStripePortalAction(formData: FormData) {
  const parsed = providerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/service-organisation/billing?billingError=invalid");
  let portalUrl: string;
  try {
    const billing = await loadProviderBilling(parsed.data.providerId);
    if (!billing.stripeCustomerId) throw new Error("stripe_customer_missing");
    const session = await getStripe().billingPortal.sessions.create({
      customer: billing.stripeCustomerId,
      return_url: `${getSiteUrl()}/service-organisation/billing?providerId=${billing.providerId}`,
    });
    portalUrl = session.url;
  } catch (error) {
    const result = failure(error);
    redirect(`/service-organisation/billing?providerId=${parsed.data.providerId}&billingError=${result.status}`);
  }
  redirect(portalUrl);
}
