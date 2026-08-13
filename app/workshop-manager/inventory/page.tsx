import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import WorkshopInventoryClient from "@/app/inventory/WorkshopInventoryClient";
import { getServiceOrganisationAccess, getWorkshopManagerAccess } from "@/lib/dal/platform-access";
import { loadMyWorkshopInventory, loadMyWorkshopInventoryMovements } from "@/lib/dal/workshop-inventory";

export const dynamic = "force-dynamic";

export default async function WorkshopManagerInventoryPage() {
  const access = await getWorkshopManagerAccess();
  if (access.state === "unauthenticated") redirect("/workshop-manager/login");
  if (access.state !== "active") redirect("/workshop-manager");
  if ((await getServiceOrganisationAccess()).state === "active") redirect("/service-organisation/inventory");
  const inventories = await loadMyWorkshopInventory();
  const movements = Object.fromEntries(await Promise.all(inventories.map(async (inventory) => [inventory.workshopId, await loadMyWorkshopInventoryMovements(inventory.workshopId)] as const)));
  return <WorkshopInventoryClient inventories={inventories} movements={movements} logoutAction={platformLogoutAction} portalBasePath="/workshop-manager" />;
}
