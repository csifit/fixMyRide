import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { getServiceOrganisationAccess } from "@/lib/dal/platform-access";
import { loadManagedServiceProviders } from "@/lib/dal/service-providers";
import { loadMyWorkshopOperations } from "@/lib/dal/workshop-operations";
import WorkshopOperationsClient from "@/app/workshop-manager/workshops/WorkshopOperationsClient";

export const dynamic = "force-dynamic";

export default async function ServiceOrganisationLocationsPage() {
  const access = await getServiceOrganisationAccess();
  if (access.state === "unauthenticated") redirect("/service-organisation/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const [workshops, providers] = await Promise.all([
    loadMyWorkshopOperations(),
    loadManagedServiceProviders(access.manager.id),
  ]);
  const ownedProviders = providers
    .filter((provider) => provider.membershipRole === "owner" && provider.status === "active")
    .map(({ id, displayName, countryCode }) => ({ id, displayName, countryCode }));
  return <WorkshopOperationsClient
    workshops={workshops}
    ownedProviders={ownedProviders}
    logoutAction={platformLogoutAction}
    portalBasePath="/service-organisation"
  />;
}
