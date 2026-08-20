import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { getServiceOrganisationAccess, getWorkshopManagerAccess } from "@/lib/dal/platform-access";
import { loadWorkshopCapacityResources } from "@/lib/dal/workshop-capacity";
import CapacityResourcesClient from "./CapacityResourcesClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorkshopCapacityPage({ searchParams }: {
  searchParams: Promise<{ workshopId?: string }>;
}) {
  const access = await getWorkshopManagerAccess();
  if (access.state === "unauthenticated") redirect("/workshop-manager/login");
  if (access.state !== "active") redirect("/workshop-manager");
  if ((await getServiceOrganisationAccess()).state === "active") {
    redirect("/service-organisation/capacity");
  }
  const locations = await loadWorkshopCapacityResources();
  const { workshopId } = await searchParams;
  const selectedWorkshopId = locations.some((item) => item.workshopId === workshopId)
    ? workshopId!
    : locations[0]?.workshopId ?? null;
  return <CapacityResourcesClient
    locations={locations}
    selectedWorkshopId={selectedWorkshopId}
    requireLocationSelection={false}
    portalBasePath="/workshop-manager"
    logoutAction={platformLogoutAction}
  />;
}
