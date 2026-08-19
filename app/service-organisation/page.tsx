import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { getServiceOrganisationAccess } from "@/lib/dal/platform-access";
import { loadManagedServiceProviders } from "@/lib/dal/service-providers";
import { loadMyWorkshopInventory } from "@/lib/dal/workshop-inventory";
import { loadMyWorkshopOperations } from "@/lib/dal/workshop-operations";
import { loadWorkshopScheduling } from "@/lib/dal/workshop-scheduling";
import { loadManagedWorkshopCatalogues } from "@/lib/dal/workshop-services";
import { loadOrganisationCoverage } from "@/lib/dal/organisation-coverage";
import { loadServiceOrganisationOperationalDashboard, loadServiceOrganisationQualityMetrics } from "@/lib/dal/service-organisation-dashboard";
import { buildProviderOnboarding } from "@/lib/provider-onboarding";
import ServiceOrganisationDashboard from "./ServiceOrganisationDashboard";

export const dynamic = "force-dynamic";

export default async function ServiceOrganisationPage() {
  const access = await getServiceOrganisationAccess();
  if (access.state === "unauthenticated") redirect("/service-organisation/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const providers = (await loadManagedServiceProviders(access.manager.id))
    .filter((provider) => provider.membershipRole === "owner");
  const [inventories, operations, catalogues, scheduling, dashboardEntries, qualityEntries, coverageEntries] = await Promise.all([
    loadMyWorkshopInventory(),
    loadMyWorkshopOperations(),
    loadManagedWorkshopCatalogues(),
    loadWorkshopScheduling(),
    Promise.all(providers.map(async (provider) => [provider.id, await loadServiceOrganisationOperationalDashboard(provider.id)] as const)),
    Promise.all(providers.map(async (provider) => [provider.id, await loadServiceOrganisationQualityMetrics(provider.id)] as const)),
    Promise.all(providers.map(async (provider) => [provider.id, await loadOrganisationCoverage(provider.id)] as const)),
  ]);
  const lowStockCount = inventories.flatMap((inventory) => inventory.items).filter((item) => item.quantity === 0 || (item.minimumQuantity > 0 && item.quantity <= item.minimumQuantity)).length;
  const coverageByProvider = Object.fromEntries(coverageEntries);
  const onboarding = Object.fromEntries(providers.map((provider) => [provider.id, buildProviderOnboarding({
    providerId: provider.id,
    operations,
    catalogues,
    schedules: scheduling.schedules,
    inventories,
    coverage: coverageByProvider[provider.id],
    includeOrganisationSteps: true,
  })]));
  return <ServiceOrganisationDashboard
    displayName={access.manager.displayName}
    providers={providers}
    lowStockCount={lowStockCount}
    dashboards={Object.fromEntries(dashboardEntries)}
    qualityMetrics={Object.fromEntries(qualityEntries)}
    onboarding={onboarding}
    logoutAction={platformLogoutAction}
  />;
}
