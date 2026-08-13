import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import WorkshopRepairsClient from "@/app/workshop-manager/repairs/WorkshopRepairsClient";
import { getServiceOrganisationAccess } from "@/lib/dal/platform-access";
import { loadManagedRepairWorkflows } from "@/lib/dal/repair-workflows";

export const dynamic = "force-dynamic";

export default async function ServiceOrganisationRepairsPage() {
  const access = await getServiceOrganisationAccess();
  if (access.state === "unauthenticated") redirect("/service-organisation/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const repairs = await loadManagedRepairWorkflows();
  return <WorkshopRepairsClient repairs={repairs} logoutAction={platformLogoutAction} />;
}
