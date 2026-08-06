import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { getWorkshopManagerAccess } from "@/lib/dal/platform-access";
import { loadManagedRepairWorkflows } from "@/lib/dal/repair-workflows";
import WorkshopRepairsClient from "./WorkshopRepairsClient";

export const dynamic = "force-dynamic";

export default async function WorkshopRepairsPage() {
  const access = await getWorkshopManagerAccess();
  if (access.state === "unauthenticated") redirect("/workshop-manager/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const repairs = await loadManagedRepairWorkflows();
  return <WorkshopRepairsClient repairs={repairs} logoutAction={platformLogoutAction} />;
}
