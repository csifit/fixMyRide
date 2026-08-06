import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { getWorkshopManagerAccess } from "@/lib/dal/platform-access";
import { loadMyWorkshopOperations } from "@/lib/dal/workshop-operations";
import WorkshopOperationsClient from "./WorkshopOperationsClient";

export const dynamic = "force-dynamic";

export default async function ManagedWorkshopsPage() {
  const access = await getWorkshopManagerAccess();
  if (access.state === "unauthenticated") redirect("/workshop-manager/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const workshops = await loadMyWorkshopOperations();
  return <WorkshopOperationsClient workshops={workshops} logoutAction={platformLogoutAction} />;
}
