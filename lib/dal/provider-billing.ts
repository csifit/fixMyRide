import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type ProviderSubscriptionStatus = "not_started" | "incomplete" | "incomplete_expired" | "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "paused";

export type ProviderBilling = {
  providerId: string;
  legalName: string;
  displayName: string;
  providerStatus: string;
  stripeCustomerId: string | null;
  billingProfile: { billingEmail: string | null; billingContact: string | null; taxIdentifier: string | null; addressLine1: string | null; addressLine2: string | null; city: string | null; postalCode: string | null; countryCode: string };
  plan: { id: string; name: string; monthlyPriceCents: number; currency: string; smsIncluded: boolean };
  organisationSubscription: { status: ProviderSubscriptionStatus; stripeSubscriptionId: string | null; stripeSubscriptionItemId: string | null; billingQuantity: number; paymentMethodConfirmedAt: string | null; paymentGraceEndsAt: string | null; currentPeriodStart: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; nextBillingAt: string; upcomingAmountCents: number };
  locations: Array<{ workshopId: string; displayName: string; city: string | null; workshopStatus: string; subscriptionStatus: ProviderSubscriptionStatus; legacyStripeSubscriptionId: string | null; coverageStartedAt: string | null; coverageGraceEndsAt: string | null; billableFrom: string | null; coverageState: "covered" | "grace" | "attention" | "uncovered" }>;
  invoices: Array<{ id: string; number: string | null; status: string; currency: string; amountDueCents: number; amountPaidCents: number; hostedInvoiceUrl: string | null; invoicePdfUrl: string | null; periodStart: string | null; periodEnd: string | null; dueAt: string | null; paidAt: string | null }>;
};

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadProviderBilling(providerId: string): Promise<ProviderBilling> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_provider_billing", { requested_provider_id: providerId });
  if (error) fail(error);
  if (!data) throw new DataAccessError("unavailable");
  return data as unknown as ProviderBilling;
}

export async function updateProviderBillingProfile(providerId: string, profile: ProviderBilling["billingProfile"]) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_provider_billing_profile", {
    requested_provider_id: providerId,
    new_billing_email: profile.billingEmail,
    new_billing_contact: profile.billingContact,
    new_tax_identifier: profile.taxIdentifier,
    new_address_line1: profile.addressLine1,
    new_address_line2: profile.addressLine2,
    new_city: profile.city,
    new_postal_code: profile.postalCode,
    new_country_code: profile.countryCode,
  });
  if (error) fail(error);
}

export async function attachProviderStripeCustomer(providerId: string, customerId: string) {
  const { error } = await createServiceClient().rpc("attach_provider_stripe_customer", {
    requested_provider_id: providerId,
    requested_stripe_customer_id: customerId,
  });
  if (error) fail(error);
}

export async function activateProviderLocationBilling(input: {
  providerId: string;
  workshopId: string;
  subscriptionId: string;
  subscriptionItemId: string;
  quantity: number;
}) {
  const { error } = await createServiceClient().rpc("activate_provider_location_billing", {
    requested_provider_id: input.providerId,
    requested_workshop_id: input.workshopId,
    requested_subscription_id: input.subscriptionId,
    requested_subscription_item_id: input.subscriptionItemId,
    requested_quantity: input.quantity,
  });
  if (error) fail(error);
}

export async function prepareProviderSubscriptionReplacement(providerId: string) {
  const { error } = await createServiceClient().rpc("prepare_provider_subscription_replacement", {
    requested_provider_id: providerId,
  });
  if (error) fail(error);
}
