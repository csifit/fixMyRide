import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { getServiceOrganisationAccess } from "@/lib/dal/platform-access";
import { loadManagedServiceProviders } from "@/lib/dal/service-providers";
import { loadMyWorkshopInventory } from "@/lib/dal/workshop-inventory";
import { loadServiceOrganisationOperationalDashboard } from "@/lib/dal/service-organisation-dashboard";
import ServiceOrganisationDashboard from "./ServiceOrganisationDashboard";

export const dynamic = "force-dynamic";

export default async function ServiceOrganisationPage() {
  const access = await getServiceOrganisationAccess();
  if (access.state === "unauthenticated") redirect("/service-organisation/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const providers = (await loadManagedServiceProviders(access.manager.id))
    .filter((provider) => provider.membershipRole === "owner");
  const [inventories, dashboardEntries] = await Promise.all([
    loadMyWorkshopInventory(),
    Promise.all(providers.map(async (provider) => [provider.id, await loadServiceOrganisationOperationalDashboard(provider.id)] as const)),
  ]);
  const lowStockCount = inventories.flatMap((inventory) => inventory.items).filter((item) => item.quantity === 0 || (item.minimumQuantity > 0 && item.quantity <= item.minimumQuantity)).length;
  return <ServiceOrganisationDashboard
    displayName={access.manager.displayName}
    providers={providers}
    lowStockCount={lowStockCount}
    dashboards={Object.fromEntries(dashboardEntries)}
    logoutAction={platformLogoutAction}
  />;
}
