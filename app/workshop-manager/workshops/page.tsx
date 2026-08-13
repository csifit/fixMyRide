import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { getServiceOrganisationAccess, getWorkshopManagerAccess } from "@/lib/dal/platform-access";
import { loadMyWorkshopOperations } from "@/lib/dal/workshop-operations";
import { loadManagedServiceProviders } from "@/lib/dal/service-providers";
import WorkshopOperationsClient from "./WorkshopOperationsClient";

export const dynamic = "force-dynamic";

export default async function ManagedWorkshopsPage() {
  const access = await getWorkshopManagerAccess();
  if (access.state === "unauthenticated") redirect("/workshop-manager/login");
  if (access.state !== "active") redirect("/workshop-manager");
  if ((await getServiceOrganisationAccess()).state === "active") redirect("/service-organisation/locations");
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
  />;
}
