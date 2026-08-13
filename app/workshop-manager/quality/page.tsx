import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { getServiceOrganisationAccess, getWorkshopManagerAccess } from "@/lib/dal/platform-access";
import { loadManagedQualityWorkspace } from "@/lib/dal/workshop-quality";
import WorkshopQualityClient from "./WorkshopQualityClient";

export const dynamic = "force-dynamic";

export default async function WorkshopQualityPage() {
  const access = await getWorkshopManagerAccess();
  if (access.state === "unauthenticated") redirect("/workshop-manager/login");
  if (access.state !== "active") redirect("/workshop-manager");
  if ((await getServiceOrganisationAccess()).state === "active") redirect("/service-organisation/quality");
  const workspace = await loadManagedQualityWorkspace();
  return <WorkshopQualityClient workspace={workspace} logoutAction={platformLogoutAction} />;
}
