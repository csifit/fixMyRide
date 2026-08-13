import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import WorkshopQualityClient from "@/app/workshop-manager/quality/WorkshopQualityClient";
import { getServiceOrganisationAccess } from "@/lib/dal/platform-access";
import { loadManagedQualityWorkspace } from "@/lib/dal/workshop-quality";

export const dynamic = "force-dynamic";

export default async function ServiceOrganisationQualityPage() {
  const access = await getServiceOrganisationAccess();
  if (access.state === "unauthenticated") redirect("/service-organisation/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const workspace = await loadManagedQualityWorkspace();
  return <WorkshopQualityClient workspace={workspace} logoutAction={platformLogoutAction} />;
}
