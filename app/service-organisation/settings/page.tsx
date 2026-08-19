import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import CustomerInvoicingSettingsClient from "@/app/customer-invoicing/CustomerInvoicingSettingsClient";
import { loadCustomerInvoicingPreferences } from "@/lib/dal/customer-invoicing";
import { getServiceOrganisationAccess } from "@/lib/dal/platform-access";
import { loadManagedServiceProviders } from "@/lib/dal/service-providers";

export const dynamic = "force-dynamic";

export default async function ServiceOrganisationSettingsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await getServiceOrganisationAccess();
  if (access.state === "unauthenticated") redirect("/service-organisation/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const [providers, preferences] = await Promise.all([
    loadManagedServiceProviders(access.manager.id),
    loadCustomerInvoicingPreferences(),
  ]);
  const owned = providers.filter((provider) => provider.membershipRole === "owner");
  if (!owned.length) redirect("/workshop-manager");
  const query = await searchParams;
  const requestedId = typeof query.providerId === "string" ? query.providerId : owned[0].id;
  const selected = owned.find((provider) => provider.id === requestedId) ?? owned[0];
  return <CustomerInvoicingSettingsClient
    preferences={preferences}
    mode="organisation"
    selectedProviderId={selected.id}
    providers={owned.map(({ id, displayName }) => ({ id, displayName }))}
    logoutAction={platformLogoutAction}
  />;
}
