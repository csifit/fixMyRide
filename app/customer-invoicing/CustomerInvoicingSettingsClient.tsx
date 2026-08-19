"use client";

import Link from "@/app/WorkspaceLink";
import { useActionState } from "react";
import { translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { FieldHelp, OperationalEmptyState, OperationalIntroduction } from "@/app/guidance/OperationalGuidance";
import type { CustomerInvoicingPreference } from "@/lib/dal/customer-invoicing";
import {
  updateProviderCustomerInvoicingAction,
  updateWorkshopCustomerInvoicingAction,
  type CustomerInvoicingActionState,
} from "./actions";

const idle: CustomerInvoicingActionState = { status: "idle" };

function Result({ state, t }: {
  state: CustomerInvoicingActionState;
  t: (key: TranslationKey) => string;
}) {
  if (state.status === "idle") return null;
  return <p className={state.status === "saved" ? "note-success" : "note-error"} role="status">
    {t(`customerInvoicing.result.${state.status}` as TranslationKey)}
  </p>;
}

function WorkshopPreferenceForm({ preference, t }: {
  preference: CustomerInvoicingPreference;
  t: (key: TranslationKey) => string;
}) {
  const [state, action, pending] = useActionState(updateWorkshopCustomerInvoicingAction, idle);
  const current = preference.workshopOverrideEnabled === null
    ? "inherit"
    : preference.workshopOverrideEnabled ? "enabled" : "disabled";
  return <form className="customer-invoicing-location" action={action}>
    <input type="hidden" name="workshopId" value={preference.workshopId} />
    <span><strong>{preference.workshopName}</strong><small>{preference.providerName}</small></span>
    <label>{t("customerInvoicing.workshopSetting")}
      <select name="override" defaultValue={current}>
        <option value="inherit">{t("customerInvoicing.inherit")}</option>
        <option value="enabled">{t("customerInvoicing.enabled")}</option>
        <option value="disabled">{t("customerInvoicing.disabled")}</option>
      </select>
      <FieldHelp>{t("customerInvoicing.overrideHelp")}</FieldHelp>
    </label>
    <span className={`customer-invoicing-effective ${preference.effectiveEnabled ? "enabled" : "disabled"}`}>
      {t(preference.effectiveEnabled ? "customerInvoicing.effectiveEnabled" : "customerInvoicing.effectiveDisabled")}
    </span>
    <button disabled={pending}>{t(pending ? "workspace.saving" : "workspace.save")}</button>
    <Result state={state} t={t} />
  </form>;
}

export default function CustomerInvoicingSettingsClient({ preferences, mode, selectedProviderId, providers, logoutAction }: {
  preferences: CustomerInvoicingPreference[];
  mode: "organisation" | "workshop";
  selectedProviderId?: string;
  providers?: Array<{ id: string; displayName: string }>;
  logoutAction: () => Promise<void>;
}) {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  const visible = selectedProviderId
    ? preferences.filter((item) => item.providerId === selectedProviderId)
    : preferences;
  const provider = visible[0];
  const [state, providerAction, pending] = useActionState(updateProviderCustomerInvoicingAction, idle);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  const backHref = mode === "organisation" ? "/service-organisation" : "/workshop-manager";
  return <main className="settings-shell customer-invoicing-shell">
    <header className="settings-topbar">
      <Link href={backHref}>← {t("workspace.back")}</Link><strong>pitster</strong>
      <select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("a11y.languageSelector")}>
        <option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option>
      </select>
      <form action={logoutAction}><button>{t("auth.logout")}</button></form>
    </header>
    <section className="settings-content customer-invoicing-content">
      <p className="registration-kicker">{t(mode === "organisation" ? "customerInvoicing.organisationEyebrow" : "customerInvoicing.workshopEyebrow")}</p>
      <div className="customer-invoicing-title">
        <div><h1>{t("customerInvoicing.title")}</h1><p>{t("customerInvoicing.description")}</p></div>
        {mode === "organisation" && providers && providers.length > 1 && <label>{t("organisationCoverage.organisation")}
          <select value={selectedProviderId} onChange={(event) => location.assign(`/service-organisation/settings?providerId=${event.target.value}`)}>
            {providers.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
          </select>
        </label>}
      </div>
      <OperationalIntroduction
        title={t("operationalGuidance.howTitle")}
        description={t("phase5.invoicing.intro")}
        outcomeLabel={t("operationalGuidance.whyLabel")}
        outcome={t("phase5.invoicing.outcome")}
        stepsLabel={t("operationalGuidance.stepsLabel")}
        steps={[t("phase5.invoicing.step1"), t("phase5.invoicing.step2"), t("phase5.invoicing.step3")]}
      />
      {mode === "organisation" && provider?.canManageProvider && <section className="customer-invoicing-default">
        <div><h2>{t("customerInvoicing.organisationDefault")}</h2><p>{t("customerInvoicing.organisationDefaultDescription")}</p></div>
        <form action={providerAction}>
          <input type="hidden" name="providerId" value={provider.providerId} />
          <label>{t("customerInvoicing.defaultSetting")}
            <select name="enabled" defaultValue={String(provider.providerDefaultEnabled)}>
              <option value="true">{t("customerInvoicing.enabled")}</option>
              <option value="false">{t("customerInvoicing.disabled")}</option>
            </select>
            <FieldHelp>{t("customerInvoicing.defaultHelp")}</FieldHelp>
          </label>
          <button disabled={pending}>{t(pending ? "workspace.saving" : "workspace.save")}</button>
          <Result state={state} t={t} />
        </form>
      </section>}
      <section className="customer-invoicing-locations">
        <header><div><h2>{t("customerInvoicing.locationSettings")}</h2><p>{t("customerInvoicing.locationSettingsDescription")}</p></div></header>
        <div>{visible.map((item) => <WorkshopPreferenceForm key={item.workshopId} preference={item} t={t} />)}</div>
        {!visible.length && <OperationalEmptyState mark="W" title={t("customerInvoicing.emptyTitle")} description={t("customerInvoicing.emptyDescription")} action={mode === "organisation" ? <Link href="/service-organisation/locations">{t("customerInvoicing.openLocations")}</Link> : undefined} />}
      </section>
      <p className="customer-invoicing-boundary">{t("customerInvoicing.platformBillingBoundary")}</p>
    </section>
  </main>;
}
