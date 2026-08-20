import type { ProviderOnboardingStepId, ProviderOnboardingSummary } from "@/lib/provider-onboarding";

export type ProviderRecommendationRole = "workshop_manager" | "service_organisation";
export type ProviderRecommendationPriority = "urgent" | "high" | "medium";
export type ProviderRecommendationRule =
  | "add_location"
  | "profile"
  | "services"
  | "capacity"
  | "resources"
  | "inventory_setup"
  | "manager"
  | "coverage"
  | "low_stock"
  | "quality_cases"
  | "maintenance_reminders"
  | "overdue_jobs"
  | "open_estimates";

export type ProviderRecommendation = {
  id: string;
  rule: ProviderRecommendationRule;
  priority: ProviderRecommendationPriority;
  score: number;
  href: string;
  workshopId: string | null;
  locationName: string | null;
  count: number;
};

export type ProviderRecommendationSignals = {
  lowStockByWorkshop?: Record<string, number>;
  openQualityByWorkshop?: Record<string, number>;
  dueRemindersByWorkshop?: Record<string, number>;
  overdueJobsByWorkshop?: Record<string, number>;
  openEstimatesByWorkshop?: Record<string, number>;
};

type BuildProviderRecommendationsInput = {
  role: ProviderRecommendationRole;
  onboarding: ProviderOnboardingSummary;
  signals?: ProviderRecommendationSignals;
};

const setupRule: Record<ProviderOnboardingStepId, Exclude<ProviderRecommendationRule, "add_location" | "low_stock" | "quality_cases" | "maintenance_reminders" | "overdue_jobs" | "open_estimates">> = {
  profile: "profile",
  services: "services",
  capacity: "capacity",
  resources: "resources",
  inventory: "inventory_setup",
  manager: "manager",
  coverage: "coverage",
};

const ruleSettings: Record<ProviderRecommendationRule, { priority: ProviderRecommendationPriority; score: number }> = {
  add_location: { priority: "urgent", score: 110 },
  coverage: { priority: "urgent", score: 100 },
  overdue_jobs: { priority: "urgent", score: 96 },
  manager: { priority: "high", score: 92 },
  quality_cases: { priority: "high", score: 88 },
  low_stock: { priority: "high", score: 86 },
  maintenance_reminders: { priority: "high", score: 82 },
  resources: { priority: "high", score: 78 },
  capacity: { priority: "high", score: 76 },
  services: { priority: "medium", score: 72 },
  profile: { priority: "medium", score: 68 },
  inventory_setup: { priority: "medium", score: 64 },
  open_estimates: { priority: "medium", score: 60 },
};

function recommendationHref(role: ProviderRecommendationRole, rule: ProviderRecommendationRule) {
  const root = role === "service_organisation" ? "/service-organisation" : "/workshop-manager";
  if (rule === "add_location" || rule === "profile") return `${root}/${role === "service_organisation" ? "locations" : "workshops"}`;
  if (rule === "capacity" || rule === "resources") return `${root}/capacity`;
  if (rule === "services") return `${root}/services`;
  if (rule === "inventory_setup" || rule === "low_stock") return `${root}/inventory`;
  if (rule === "manager") return `${root}/managers`;
  if (rule === "coverage") return `${root}/billing`;
  if (rule === "quality_cases" || rule === "maintenance_reminders") return `${root}/quality`;
  return `${root}/repairs`;
}

function createRecommendation(role: ProviderRecommendationRole, rule: ProviderRecommendationRule, workshopId: string | null, locationName: string | null, count: number) {
  const settings = ruleSettings[rule];
  return {
    id: `${rule}:${workshopId ?? "provider"}`,
    rule,
    priority: settings.priority,
    score: settings.score,
    href: recommendationHref(role, rule),
    workshopId,
    locationName,
    count,
  } satisfies ProviderRecommendation;
}

export function buildProviderRecommendations({ role, onboarding, signals = {} }: BuildProviderRecommendationsInput): ProviderRecommendation[] {
  if (!onboarding.locations.length) return [createRecommendation(role, "add_location", null, null, 0)];
  const recommendations: ProviderRecommendation[] = [];
  for (const location of onboarding.locations) {
    for (const step of location.steps) {
      if (!step.complete) recommendations.push(createRecommendation(role, setupRule[step.id], location.workshopId, location.name, step.value));
    }
    const signalRules: Array<[ProviderRecommendationRule, Record<string, number> | undefined]> = [
      ["low_stock", signals.lowStockByWorkshop],
      ["quality_cases", signals.openQualityByWorkshop],
      ["maintenance_reminders", signals.dueRemindersByWorkshop],
      ["overdue_jobs", signals.overdueJobsByWorkshop],
      ["open_estimates", signals.openEstimatesByWorkshop],
    ];
    for (const [rule, values] of signalRules) {
      const count = values?.[location.workshopId] ?? 0;
      if (count > 0) recommendations.push(createRecommendation(role, rule, location.workshopId, location.name, count));
    }
  }
  return recommendations.sort((left, right) => right.score - left.score || (left.locationName ?? "").localeCompare(right.locationName ?? "") || left.rule.localeCompare(right.rule));
}
