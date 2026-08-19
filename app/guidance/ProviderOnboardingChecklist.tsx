"use client";

import Link from "next/link";
import { translate, type Language, type TranslationKey } from "@/app/i18n";
import type { ProviderOnboardingStepId, ProviderOnboardingSummary } from "@/lib/provider-onboarding";

type Role = "workshop_manager" | "service_organisation";

const stepOrder: ProviderOnboardingStepId[] = ["profile", "services", "capacity", "resources", "inventory", "manager", "coverage"];

function stepHref(role: Role, step: ProviderOnboardingStepId) {
  const root = role === "service_organisation" ? "/service-organisation" : "/workshop-manager";
  if (step === "profile" || step === "capacity") return `${root}/${role === "service_organisation" ? "locations" : "workshops"}`;
  if (step === "services") return `${root}/services`;
  if (step === "resources") return `${root}/requests#capacity`;
  if (step === "inventory") return `${root}/inventory`;
  if (step === "manager") return `${root}/managers`;
  return `${root}/billing`;
}

function StepStatus({ complete, language }: { complete: boolean; language: Language }) {
  return <span className={`provider-onboarding-status${complete ? " complete" : ""}`}>
    <span aria-hidden="true">{complete ? "✓" : "○"}</span>
    {translate(language, complete ? "onboarding.complete" : "onboarding.toDo")}
  </span>;
}

export default function ProviderOnboardingChecklist({ role, summary, language }: { role: Role; summary: ProviderOnboardingSummary; language: Language }) {
  const t = (key: TranslationKey) => translate(language, key);
  const steps = stepOrder.filter((id) => summary.locations.some((location) => location.steps.some((step) => step.id === id)));
  const readyLocations = summary.locations.filter((location) => location.percent === 100).length;
  return <section className="provider-onboarding" id="getting-started" aria-labelledby="provider-onboarding-title">
    <header className="provider-onboarding-header">
      <div>
        <p>{t("onboarding.eyebrow")}</p>
        <h2 id="provider-onboarding-title">{t(role === "service_organisation" ? "onboarding.organisationTitle" : "onboarding.managerTitle")}</h2>
        <span>{t(role === "service_organisation" ? "onboarding.organisationDescription" : "onboarding.managerDescription")}</span>
      </div>
      <div className="provider-onboarding-score" aria-label={translate(language, "onboarding.progressLabel", { percent: summary.percent })}>
        <strong>{summary.percent}%</strong>
        <span>{summary.completed} / {summary.total} {t("onboarding.steps")}</span>
      </div>
    </header>

    {!summary.locations.length ? <div className="provider-onboarding-empty">
      <h3>{t("onboarding.noLocationsTitle")}</h3>
      <p>{t("onboarding.noLocationsDescription")}</p>
      <Link href={role === "service_organisation" ? "/service-organisation/locations" : "/workshop-manager/workshops"}>{t("onboarding.addLocation")}</Link>
    </div> : <>
      <div className="provider-onboarding-progress" aria-hidden="true"><span style={{ width: `${summary.percent}%` }} /></div>
      {summary.percent === 100 && <p className="provider-onboarding-ready">✓ {t("onboarding.readyMessage")}</p>}
      <div className="provider-onboarding-steps">
        {steps.map((id) => {
          const locationsWithStep = summary.locations.filter((location) => location.steps.some((step) => step.id === id));
          const completedLocations = locationsWithStep.filter((location) => location.steps.find((step) => step.id === id)?.complete).length;
          const complete = completedLocations === locationsWithStep.length;
          return <article key={id} className={complete ? "complete" : ""}>
            <header><span className="provider-onboarding-step-mark" aria-hidden="true">{complete ? "✓" : stepOrder.indexOf(id) + 1}</span><StepStatus complete={complete} language={language} /></header>
            <h3>{t(`onboarding.step.${id}.title` as TranslationKey)}</h3>
            <p>{t(`onboarding.step.${id}.description` as TranslationKey)}</p>
            <footer><span>{completedLocations} / {locationsWithStep.length} {t("onboarding.locations")}</span><Link href={stepHref(role, id)}>{complete ? t("onboarding.review") : t("onboarding.continue")}</Link></footer>
          </article>;
        })}
      </div>

      {role === "service_organisation" && <section className="provider-location-readiness">
        <header><div><p>{t("onboarding.locationEyebrow")}</p><h3>{t("onboarding.locationTitle")}</h3></div><span>{readyLocations} / {summary.locations.length} {t("onboarding.locationsReady")}</span></header>
        <div>{summary.locations.map((location) => <details key={location.workshopId} className={location.percent === 100 ? "complete" : ""}>
          <summary>
            <span><strong>{location.name}</strong><small>{location.city || t("onboarding.cityUnavailable")}</small></span>
            <span className="provider-location-progress"><span aria-hidden="true"><b style={{ width: `${location.percent}%` }} /></span><small>{location.completed} / {location.total}</small></span>
            <em>{location.percent}%</em>
          </summary>
          <div className="provider-location-step-list">{location.steps.map((step) => <div key={step.id} className={step.complete ? "complete" : ""}>
            <StepStatus complete={step.complete} language={language} />
            <span>{t(`onboarding.step.${step.id}.title` as TranslationKey)}</span>
            <Link href={stepHref(role, step.id)}>{step.complete ? t("onboarding.review") : t("onboarding.fix")}</Link>
          </div>)}</div>
        </details>)}</div>
      </section>}
    </>}
  </section>;
}
