import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import WorkshopInventoryClient from "@/app/inventory/WorkshopInventoryClient";
import { getWorkshopManagerAccess } from "@/lib/dal/platform-access";
import { loadMyWorkshopInventory } from "@/lib/dal/workshop-inventory";

export const dynamic = "force-dynamic";

export default async function WorkshopManagerInventoryPage() {
  const access = await getWorkshopManagerAccess();
  if (access.state === "unauthenticated") redirect("/workshop-manager/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const inventories = await loadMyWorkshopInventory();
  return <WorkshopInventoryClient inventories={inventories} logoutAction={platformLogoutAction} portalBasePath="/workshop-manager" />;
}
