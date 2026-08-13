import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { getWorkshopManagerAccess } from "@/lib/dal/platform-access";
import { loadManagedQualityWorkspace } from "@/lib/dal/workshop-quality";
import WorkshopQualityClient from "./WorkshopQualityClient";

export const dynamic = "force-dynamic";

export default async function WorkshopQualityPage() {
  const access = await getWorkshopManagerAccess();
  if (access.state === "unauthenticated") redirect("/workshop-manager/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const workspace = await loadManagedQualityWorkspace();
  return <WorkshopQualityClient workspace={workspace} logoutAction={platformLogoutAction} />;
}

