import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildProviderOnboarding } from "../lib/provider-onboarding.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const managerPage = await read("app/workshop-manager/page.tsx");
const organisationPage = await read("app/service-organisation/page.tsx");
const managerDashboard = await read("app/workshop-manager/WorkshopManagerDashboard.tsx");
const organisationDashboard = await read("app/service-organisation/ServiceOrganisationDashboard.tsx");
const component = await read("app/guidance/ProviderOnboardingChecklist.tsx");
const readiness = await read("lib/provider-onboarding.ts");
const shell = await read("app/RoleWorkspaceShell.tsx");
const styles = await read("app/globals.css");

const workshop = {
  id: "workshop-1", serviceProviderId: "provider-1", serviceProviderName: "Provider", displayName: "Central Workshop",
  countryCode: "RO", status: "active", claimStatus: "claimed", logoPath: "provider-1/workshop-1/logo.png", logoUrl: "logo", logoEligible: true,
  description: "A complete workshop description", publicPhone: "+40123456789", publicEmail: null, city: "Cluj", address: "Main street 1",
  latitude: 46.77, longitude: 23.59, acceptsBookingRequests: true, offersPickup: false, offersCourtesyCar: false, allowsWaitOnSite: true,
  timeZone: "Europe/Bucharest", minimumLeadMinutes: 60, bookingHorizonDays: 30, dailyBookingCapacity: 5, slotIntervalMinutes: 30,
  operatingHours: [{ weekday: 1, opensAt: "08:00", closesAt: "17:00", closed: false }], closures: [],
};

const completeInput = {
  operations: [workshop],
  catalogues: [{ workshopId: workshop.id, serviceProviderId: workshop.serviceProviderId, workshopName: workshop.displayName, services: Array.from({ length: 5 }, (_, index) => ({ id: `service-${index}`, serviceCode: `service-${index}`, workshopId: workshop.id, name: `Service ${index}`, category: "Maintenance", description: null, vehicleType: "car_van", bookingMode: "direct", estimatedDurationMinutes: 60, priceFromCents: null, currency: "EUR", requiresDiagnosis: false, active: true, displayOrder: index })) }],
  schedules: [{ workshopId: workshop.id, workshopName: workshop.displayName, dailyCapacity: 5, resources: [{ id: "mechanic", kind: "mechanic", name: "Mechanic", active: true, absences: [] }, { id: "bay", kind: "bay", name: "Bay", active: true, absences: [] }] }],
  inventories: [{ workshopId: workshop.id, serviceProviderId: workshop.serviceProviderId, serviceProviderName: "Provider", workshopName: workshop.displayName, items: [{ minimumQuantity: 2 }] }],
};

test("readiness is derived from real workshop setup instead of manual checkboxes", () => {
  const manager = buildProviderOnboarding(completeInput);
  assert.deepEqual({ completed: manager.completed, total: manager.total, percent: manager.percent }, { completed: 5, total: 5, percent: 100 });

  const organisation = buildProviderOnboarding({ ...completeInput, providerId: "provider-1", includeOrganisationSteps: true, coverage: { locations: [{ id: workshop.id, primaryManagerId: "manager-1", primaryManagerStatus: "active", coverageState: "covered" }] } });
  assert.deepEqual({ completed: organisation.completed, total: organisation.total, percent: organisation.percent }, { completed: 7, total: 7, percent: 100 });

  const incomplete = buildProviderOnboarding({ ...completeInput, catalogues: [{ ...completeInput.catalogues[0], services: completeInput.catalogues[0].services.slice(0, 4) }], inventories: [{ ...completeInput.inventories[0], items: [{ minimumQuantity: 0 }] }] });
  assert.equal(incomplete.percent, 60);
  assert.equal(incomplete.locations[0].steps.find((step) => step.id === "services").complete, false);
  assert.equal(incomplete.locations[0].steps.find((step) => step.id === "inventory").complete, false);
});

test("both provider dashboards load and render the shared checklist", () => {
  for (const source of [managerPage, organisationPage]) {
    assert.match(source, /loadMyWorkshopOperations/);
    assert.match(source, /loadManagedWorkshopCatalogues/);
    assert.match(source, /loadWorkshopScheduling/);
    assert.match(source, /buildProviderOnboarding/);
  }
  assert.match(managerDashboard, /ProviderOnboardingChecklist role="workshop_manager"/);
  assert.match(organisationDashboard, /ProviderOnboardingChecklist role="service_organisation"/);
});

test("organisations receive per-location progress and provider-specific manager and coverage checks", () => {
  assert.match(organisationPage, /loadOrganisationCoverage/);
  assert.match(organisationPage, /includeOrganisationSteps: true/);
  assert.match(component, /provider-location-readiness/);
  assert.match(component, /summary\.locations\.map/);
  assert.match(readiness, /id: "manager"/);
  assert.match(readiness, /id: "coverage"/);
});

test("provider sidebars link to the dashboard getting-started section", () => {
  assert.match(shell, /\/workshop-manager#getting-started/);
  assert.match(shell, /\/service-organisation#getting-started/);
  assert.match(shell, /roleSidebar\.nav\.gettingStarted/);
  assert.match(component, /id="getting-started"/);
});

test("Phase 2 onboarding follows readable normal-weight typography", () => {
  const onboardingCss = styles.slice(styles.indexOf("/* Provider onboarding — Phase 2 */"));
  const sizes = [...onboardingCss.matchAll(/font-size:\s*([0-9.]+)px/g)].map((match) => Number(match[1]));
  assert.equal(sizes.some((size) => size < 10), false);
  assert.doesNotMatch(onboardingCss, /font(?:-weight|):\s*(?:[5-9][0-9]{2}|bold|bolder)/);
});
