import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { getWorkshopManagerAccess } from "@/lib/dal/platform-access";
import { loadManagedServiceProviders } from "@/lib/dal/service-providers";
import { loadMyWorkshopInventory } from "@/lib/dal/workshop-inventory";
import WorkshopManagerDashboard from "./WorkshopManagerDashboard";

export const dynamic = "force-dynamic";

export default async function WorkshopManagerPage() {
  const access = await getWorkshopManagerAccess();
  if (access.state === "unauthenticated") redirect("/workshop-manager/login");
  if (access.state !== "active") return <main className="registration-shell"><section className="registration-card"><h1>Workshop manager access</h1><p>Your account is currently {access.state}. Contact platform support if this is unexpected.</p></section></main>;
  const providers = await loadManagedServiceProviders(access.manager.id);
  if (providers.some((provider) => provider.membershipRole === "owner")) {
    redirect("/service-organisation");
  }
  const inventories = await loadMyWorkshopInventory();
  const lowStockCount = inventories.flatMap((inventory) => inventory.items).filter((item) => item.quantity === 0 || (item.minimumQuantity > 0 && item.quantity <= item.minimumQuantity)).length;
  return <WorkshopManagerDashboard displayName={access.manager.displayName} providers={providers} lowStockCount={lowStockCount} logoutAction={platformLogoutAction} />;
}
