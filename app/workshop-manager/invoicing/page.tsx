import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { loadProviderBilling } from "@/lib/dal/provider-billing";
import { getWorkshopManagerAccess } from "@/lib/dal/platform-access";
import { loadManagedServiceProviders } from "@/lib/dal/service-providers";
import { isStripeConfigured } from "@/lib/stripe/server";
import ProviderBillingClient from "./ProviderBillingClient";

export const dynamic = "force-dynamic";

export default async function ServiceProviderInvoicingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await getWorkshopManagerAccess();
  if (access.state === "unauthenticated") redirect("/workshop-manager/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const providers = (await loadManagedServiceProviders(access.manager.id)).filter((provider) => provider.membershipRole === "owner");
  if (!providers.length) redirect("/workshop-manager");
  const query = await searchParams;
  const requestedId = typeof query.providerId === "string" ? query.providerId : providers[0].id;
  const selected = providers.find((provider) => provider.id === requestedId) ?? providers[0];
  const billing = await loadProviderBilling(selected.id);
  return <ProviderBillingClient billing={billing} providers={providers.map(({ id, displayName }) => ({ id, displayName }))} stripeConfigured={isStripeConfigured()} notice={typeof query.checkout === "string" ? query.checkout : null} error={typeof query.billingError === "string" ? query.billingError : null} claimState={typeof query.claim === "string" ? query.claim : null} claimWorkshopId={typeof query.workshopId === "string" ? query.workshopId : null} logoutAction={platformLogoutAction} />;
}
