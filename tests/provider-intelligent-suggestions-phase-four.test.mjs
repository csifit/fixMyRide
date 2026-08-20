import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildProviderRecommendations } from "../lib/provider-recommendations.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const component = await read("app/guidance/ProviderRecommendations.tsx");
const managerPage = await read("app/workshop-manager/page.tsx");
const managerDashboard = await read("app/workshop-manager/WorkshopManagerDashboard.tsx");
const organisationPage = await read("app/service-organisation/page.tsx");
const organisationDashboard = await read("app/service-organisation/ServiceOrganisationDashboard.tsx");
const styles = await read("app/globals.css");
const english = JSON.parse(await read("app/i18n/en.json"));

const location = {
  workshopId: "workshop-1", providerId: "provider-1", name: "Central Workshop", city: "Cluj",
  completed: 1, total: 7, percent: 14,
  steps: [
    { id: "profile", complete: false, value: 0 },
    { id: "services", complete: false, value: 2 },
    { id: "capacity", complete: true, value: 5 },
    { id: "resources", complete: false, value: 1 },
    { id: "inventory", complete: false, value: 0 },
    { id: "manager", complete: false, value: 0 },
    { id: "coverage", complete: false, value: 0 },
  ],
};

test("recommendations rank urgent live risks ahead of setup and optimisation", () => {
  const recommendations = buildProviderRecommendations({
    role: "service_organisation",
    onboarding: { completed: 1, total: 7, percent: 14, locations: [location] },
    signals: {
      overdueJobsByWorkshop: { "workshop-1": 2 },
      openQualityByWorkshop: { "workshop-1": 1 },
      lowStockByWorkshop: { "workshop-1": 4 },
      openEstimatesByWorkshop: { "workshop-1": 3 },
    },
  });
  assert.deepEqual(recommendations.slice(0, 5).map((item) => item.rule), ["coverage", "overdue_jobs", "manager", "quality_cases", "low_stock"]);
  assert.equal(recommendations[0].priority, "urgent");
  assert.equal(recommendations.find((item) => item.rule === "low_stock").count, 4);
  assert.equal(recommendations.every((item) => item.locationName === "Central Workshop"), true);
});

test("every rule provides the direct role-specific action destination", () => {
  const organisation = buildProviderRecommendations({ role: "service_organisation", onboarding: { completed: 1, total: 7, percent: 14, locations: [location] } });
  assert.equal(organisation.find((item) => item.rule === "coverage").href, "/service-organisation/billing");
  assert.equal(organisation.find((item) => item.rule === "manager").href, "/service-organisation/managers");
  assert.equal(organisation.find((item) => item.rule === "resources").href, "/service-organisation/capacity");

  const managerLocation = { ...location, total: 5, steps: location.steps.slice(0, 5) };
  const manager = buildProviderRecommendations({ role: "workshop_manager", onboarding: { completed: 1, total: 5, percent: 20, locations: [managerLocation] } });
  assert.equal(manager.find((item) => item.rule === "profile").href, "/workshop-manager/workshops");
  assert.equal(manager.find((item) => item.rule === "services").href, "/workshop-manager/services");
});

test("an empty provider receives one clear first-location recommendation", () => {
  const recommendations = buildProviderRecommendations({ role: "service_organisation", onboarding: { completed: 0, total: 0, percent: 0, locations: [] } });
  assert.deepEqual(recommendations.map((item) => item.rule), ["add_location"]);
  assert.equal(recommendations[0].href, "/service-organisation/locations");
});

test("both dashboards calculate and display state-driven suggestions", () => {
  assert.match(managerPage, /buildProviderRecommendations/);
  assert.match(managerPage, /lowStockByWorkshop/);
  assert.match(managerPage, /openQualityByWorkshop/);
  assert.match(managerDashboard, /<ProviderRecommendations/);
  assert.match(organisationPage, /overdueJobsByWorkshop/);
  assert.match(organisationPage, /openEstimatesByWorkshop/);
  assert.match(organisationDashboard, /selectedRecommendations/);
  assert.match(organisationDashboard, /<ProviderRecommendations/);
});

test("suggestion cards expose reasons, priority and direct links", () => {
  assert.match(component, /recommendation\.priority/);
  assert.match(component, /recommendation\.locationName/);
  assert.match(component, /recommendation\.count/);
  assert.match(component, /href=\{recommendation\.href\}/);
  assert.match(component, /suggestions\.openAction/);
  for (const rule of ["add_location", "profile", "services", "capacity", "resources", "inventory_setup", "manager", "coverage", "low_stock", "quality_cases", "maintenance_reminders", "overdue_jobs", "open_estimates"]) {
    assert.equal(typeof english[`suggestions.rule.${rule}.title`], "string");
    assert.equal(typeof english[`suggestions.rule.${rule}.description`], "string");
  }
});

test("Phase 4 suggestions follow readable normal-weight typography", () => {
  const suggestionCss = styles.slice(styles.indexOf("/* Intelligent provider suggestions — Phase 4 */"));
  const sizes = [...suggestionCss.matchAll(/font-size:\s*([0-9.]+)px/g)].map((match) => Number(match[1]));
  assert.equal(sizes.some((size) => size < 10), false);
  assert.doesNotMatch(suggestionCss, /font(?:-weight|):\s*(?:[5-9][0-9]{2}|bold|bolder)/);
});
