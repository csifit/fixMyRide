import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { loadOrganisationCoverage } from "@/lib/dal/organisation-coverage";
import { getWorkshopManagerAccess } from "@/lib/dal/platform-access";
import { loadManagedServiceProviders } from "@/lib/dal/service-providers";
import OrganisationCoverageClient from "./OrganisationCoverageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OrganisationCoveragePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await getWorkshopManagerAccess();
  if (access.state === "unauthenticated") redirect("/workshop-manager/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const providers = (await loadManagedServiceProviders(access.manager.id))
    .filter((provider) => provider.membershipRole === "owner");
  if (!providers.length) redirect("/workshop-manager");
  const query = await searchParams;
  const requestedId = typeof query.providerId === "string"
    ? query.providerId
    : providers[0].id;
  const selected = providers.find((provider) => provider.id === requestedId)
    ?? providers[0];
  const coverage = await loadOrganisationCoverage(selected.id);
  return <OrganisationCoverageClient
    coverage={coverage}
    providers={providers.map(({ id, displayName }) => ({ id, displayName }))}
    logoutAction={platformLogoutAction}
  />;
}
