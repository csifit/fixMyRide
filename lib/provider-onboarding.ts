import type { OrganisationCoverage } from "@/lib/dal/organisation-coverage";
import type { WorkshopInventory } from "@/lib/dal/workshop-inventory";
import type { WorkshopOperations } from "@/lib/dal/workshop-operations";
import type { WorkshopSchedule } from "@/lib/dal/workshop-scheduling";
import type { ManagedWorkshopCatalogue } from "@/lib/dal/workshop-services";

export type ProviderOnboardingStepId =
  | "profile"
  | "services"
  | "capacity"
  | "resources"
  | "inventory"
  | "manager"
  | "coverage";

export type ProviderOnboardingStep = {
  id: ProviderOnboardingStepId;
  complete: boolean;
  value: number;
};

export type ProviderOnboardingLocation = {
  workshopId: string;
  providerId: string;
  name: string;
  city: string | null;
  completed: number;
  total: number;
  percent: number;
  steps: ProviderOnboardingStep[];
};

export type ProviderOnboardingSummary = {
  completed: number;
  total: number;
  percent: number;
  locations: ProviderOnboardingLocation[];
};

type BuildProviderOnboardingInput = {
  operations: WorkshopOperations[];
  catalogues: ManagedWorkshopCatalogue[];
  schedules: WorkshopSchedule[];
  inventories: WorkshopInventory[];
  providerId?: string;
  coverage?: OrganisationCoverage | null;
  includeOrganisationSteps?: boolean;
};

const percentage = (completed: number, total: number) => total ? Math.round(completed / total * 100) : 0;

export function buildProviderOnboarding(input: BuildProviderOnboardingInput): ProviderOnboardingSummary {
  const catalogues = new Map(input.catalogues.map((item) => [item.workshopId, item]));
  const schedules = new Map(input.schedules.map((item) => [item.workshopId, item]));
  const inventories = new Map(input.inventories.map((item) => [item.workshopId, item]));
  const coverage = new Map((input.coverage?.locations ?? []).map((item) => [item.id, item]));
  const locations = input.operations
    .filter((item) => !input.providerId || item.serviceProviderId === input.providerId)
    .map((workshop): ProviderOnboardingLocation => {
      const catalogue = catalogues.get(workshop.id);
      const schedule = schedules.get(workshop.id);
      const inventory = inventories.get(workshop.id);
      const locationCoverage = coverage.get(workshop.id);
      const activeServices = catalogue?.services.filter((service) => service.active && service.serviceCode !== "diagnosis").length ?? 0;
      const activeResources = schedule?.resources.filter((resource) => resource.active) ?? [];
      const openDays = workshop.operatingHours.filter((day) => !day.closed && day.opensAt && day.closesAt).length;
      const profileComplete = Boolean(
        workshop.description?.trim()
        && (workshop.publicPhone?.trim() || workshop.publicEmail?.trim())
        && workshop.city?.trim()
        && workshop.address?.trim()
        && workshop.latitude !== null
        && workshop.longitude !== null
        && (!workshop.logoEligible || workshop.logoPath),
      );
      const steps: ProviderOnboardingStep[] = [
        { id: "profile", complete: profileComplete, value: profileComplete ? 1 : 0 },
        { id: "services", complete: activeServices >= 5, value: activeServices },
        { id: "capacity", complete: (schedule?.dailyCapacity ?? workshop.dailyBookingCapacity) > 0 && openDays > 0, value: openDays },
        { id: "resources", complete: activeResources.some((resource) => resource.kind === "mechanic") && activeResources.some((resource) => resource.kind === "bay" || resource.kind === "ramp"), value: activeResources.length },
        { id: "inventory", complete: Boolean(inventory?.items.length && inventory.items.some((item) => item.minimumQuantity > 0)), value: inventory?.items.length ?? 0 },
      ];
      if (input.includeOrganisationSteps) {
        steps.push(
          { id: "manager", complete: Boolean(locationCoverage?.primaryManagerId && locationCoverage.primaryManagerStatus === "active"), value: locationCoverage?.primaryManagerId ? 1 : 0 },
          { id: "coverage", complete: locationCoverage?.coverageState === "covered" || locationCoverage?.coverageState === "grace", value: locationCoverage?.coverageState === "covered" || locationCoverage?.coverageState === "grace" ? 1 : 0 },
        );
      }
      const completed = steps.filter((step) => step.complete).length;
      return {
        workshopId: workshop.id,
        providerId: workshop.serviceProviderId,
        name: workshop.displayName,
        city: workshop.city,
        completed,
        total: steps.length,
        percent: percentage(completed, steps.length),
        steps,
      };
    });
  const completed = locations.reduce((sum, location) => sum + location.completed, 0);
  const total = locations.reduce((sum, location) => sum + location.total, 0);
  return { completed, total, percent: percentage(completed, total), locations };
}
