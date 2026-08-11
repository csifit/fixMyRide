import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { getServiceOrganisationAccess } from "@/lib/dal/platform-access";
import { loadManagedServiceProviders } from "@/lib/dal/service-providers";
import { loadOrganisationCoverage } from "@/lib/dal/organisation-coverage";
import OrganisationCoverageClient from "@/app/workshop-manager/organisation/OrganisationCoverageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ServiceOrganisationManagersPage({ searchParams }: {
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
  const coverage = await loadOrganisationCoverage(selected.id);
  return <OrganisationCoverageClient
    coverage={coverage}
    providers={providers.map(({ id, displayName }) => ({ id, displayName }))}
    logoutAction={platformLogoutAction}
    portalBasePath="/service-organisation"
  />;
}
