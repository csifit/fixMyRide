import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { getServiceOrganisationAccess } from "@/lib/dal/platform-access";
import { loadProviderBilling } from "@/lib/dal/provider-billing";
import { loadManagedServiceProviders } from "@/lib/dal/service-providers";
import { isStripeConfigured } from "@/lib/stripe/server";
import ProviderBillingClient from "@/app/workshop-manager/invoicing/ProviderBillingClient";

export const dynamic = "force-dynamic";

export default async function ServiceOrganisationBillingPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await getServiceOrganisationAccess();
  if (access.state === "unauthenticated") redirect("/service-organisation/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const providers = (await loadManagedServiceProviders(access.manager.id))
    .filter((provider) => provider.membershipRole === "owner");
  const query = await searchParams;
  const requestedId = typeof query.providerId === "string" ? query.providerId : providers[0].id;
  const selected = providers.find((provider) => provider.id === requestedId) ?? providers[0];
  const billing = await loadProviderBilling(selected.id);
  return <ProviderBillingClient
    billing={billing}
    providers={providers.map(({ id, displayName }) => ({ id, displayName }))}
    stripeConfigured={isStripeConfigured()}
    notice={typeof query.checkout === "string" ? query.checkout : null}
    error={typeof query.billingError === "string" ? query.billingError : null}
    claimState={typeof query.claim === "string" ? query.claim : null}
    claimWorkshopId={typeof query.workshopId === "string" ? query.workshopId : null}
    logoutAction={platformLogoutAction}
    portalBasePath="/service-organisation"
  />;
}
