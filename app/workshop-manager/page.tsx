import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { getWorkshopManagerAccess } from "@/lib/dal/platform-access";
import { loadManagedServiceProviders } from "@/lib/dal/service-providers";
import { loadMyWorkshopInventory } from "@/lib/dal/workshop-inventory";
import { loadMyWorkshopOperations } from "@/lib/dal/workshop-operations";
import { loadManagedQualityWorkspace } from "@/lib/dal/workshop-quality";
import { loadWorkshopScheduling } from "@/lib/dal/workshop-scheduling";
import { loadManagedWorkshopCatalogues } from "@/lib/dal/workshop-services";
import { buildProviderOnboarding } from "@/lib/provider-onboarding";
import { buildProviderRecommendations } from "@/lib/provider-recommendations";
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
  const [inventories, qualityWorkspace, operations, catalogues, scheduling] = await Promise.all([
    loadMyWorkshopInventory(), loadManagedQualityWorkspace(), loadMyWorkshopOperations(), loadManagedWorkshopCatalogues(), loadWorkshopScheduling(),
  ]);
  const lowStockCount = inventories.flatMap((inventory) => inventory.items).filter((item) => item.quantity === 0 || (item.minimumQuantity > 0 && item.quantity <= item.minimumQuantity)).length;
  const onboarding = buildProviderOnboarding({ operations, catalogues, schedules: scheduling.schedules, inventories });
  const recommendations = buildProviderRecommendations({
    role: "workshop_manager",
    onboarding,
    signals: {
      lowStockByWorkshop: Object.fromEntries(inventories.map((inventory) => [inventory.workshopId, inventory.items.filter((item) => item.quantity === 0 || (item.minimumQuantity > 0 && item.quantity <= item.minimumQuantity)).length])),
      openQualityByWorkshop: countByWorkshop(qualityWorkspace.cases.filter((item) => item.status === "open").map((item) => item.workshopId)),
      dueRemindersByWorkshop: countByWorkshop(qualityWorkspace.dueReminders.map((item) => item.workshopId)),
    },
  });
  return <WorkshopManagerDashboard displayName={access.manager.displayName} providers={providers} onboarding={onboarding} recommendations={recommendations} lowStockCount={lowStockCount} dueReminderCount={qualityWorkspace.dueReminders.length} openQualityCaseCount={qualityWorkspace.cases.filter((item) => item.status === "open").length} logoutAction={platformLogoutAction} />;
}

function countByWorkshop(workshopIds: string[]) {
  return workshopIds.reduce<Record<string, number>>((counts, workshopId) => ({ ...counts, [workshopId]: (counts[workshopId] ?? 0) + 1 }), {});
}
