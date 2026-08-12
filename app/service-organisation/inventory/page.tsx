import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import WorkshopInventoryClient from "@/app/inventory/WorkshopInventoryClient";
import { getServiceOrganisationAccess } from "@/lib/dal/platform-access";
import { loadMyWorkshopInventory } from "@/lib/dal/workshop-inventory";

export const dynamic = "force-dynamic";

export default async function ServiceOrganisationInventoryPage() {
  const access = await getServiceOrganisationAccess();
  if (access.state === "unauthenticated") redirect("/service-organisation/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const inventories = await loadMyWorkshopInventory();
  return <WorkshopInventoryClient inventories={inventories} logoutAction={platformLogoutAction} portalBasePath="/service-organisation" />;
}
