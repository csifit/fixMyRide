import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import CapacityResourcesClient from "@/app/workshop-manager/capacity/CapacityResourcesClient";
import { getServiceOrganisationAccess } from "@/lib/dal/platform-access";
import { loadWorkshopCapacityResources } from "@/lib/dal/workshop-capacity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ServiceOrganisationCapacityPage({ searchParams }: {
  searchParams: Promise<{ workshopId?: string }>;
}) {
  const access = await getServiceOrganisationAccess();
  if (access.state === "unauthenticated") redirect("/service-organisation/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const locations = await loadWorkshopCapacityResources();
  const { workshopId } = await searchParams;
  const selectedWorkshopId = locations.some((item) => item.workshopId === workshopId)
    ? workshopId!
    : null;
  return <CapacityResourcesClient
    locations={locations}
    selectedWorkshopId={selectedWorkshopId}
    requireLocationSelection
    portalBasePath="/service-organisation"
    logoutAction={platformLogoutAction}
  />;
}
