"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  formatDateTime,
  locales,
  translate,
  type Language,
  type TranslationKey,
} from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { ProviderBilling } from "@/lib/dal/provider-billing";
import {
  openStripePortalAction,
  startStripeCheckoutAction,
  updateProviderBillingProfileAction,
  type ProviderBillingActionState,
} from "./actions";

const idle: ProviderBillingActionState = { status: "idle" };
const money = (language: Language, cents: number, currency: string) =>
  new Intl.NumberFormat(locales[language], { style: "currency", currency })
    .format(cents / 100);

export default function ProviderBillingClient({ billing, providers, stripeConfigured, notice, error, logoutAction }: {
  billing: ProviderBilling;
  providers: Array<{ id: string; displayName: string }>;
  stripeConfigured: boolean;
  notice: string | null;
  error: string | null;
  logoutAction: () => Promise<void>;
}) {
  const [language, setLanguage, ready] = useLanguage();
  const [state, profileAction, pending] = useActionState(
    updateProviderBillingProfileAction,
    idle,
  );
  const t = (key: TranslationKey) => translate(language, key);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  const hasCustomer = Boolean(billing.stripeCustomerId);

  return <main className="billing-shell">
    <header className="settings-topbar">
      <Link href="/workshop-manager">← {t("workspace.back")}</Link>
      <strong>pitster</strong>
      <select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("a11y.languageSelector")}>
        <option value="en">EN</option><option value="de">DE</option>
        <option value="ro">RO</option><option value="hu">HU</option>
      </select>
      <form action={logoutAction}><button>{t("auth.logout")}</button></form>
    </header>
    <section className="billing-content provider-billing-content">
      <p className="registration-kicker">{t("providerBilling.eyebrow")}</p>
      <div className="provider-billing-title">
        <div><h1>{t("providerBilling.title")}</h1><p>{t("providerBilling.description")}</p></div>
        {providers.length > 1 && <label>{t("providerBilling.provider")}<select value={billing.providerId} onChange={(event) => location.assign(`/workshop-manager/invoicing?providerId=${event.target.value}`)}>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}</select></label>}
      </div>
      {notice === "success" && <p className="note-success">{t("providerBilling.checkoutSuccess")}</p>}
      {notice === "cancelled" && <p className="note-error">{t("providerBilling.checkoutCancelled")}</p>}
      {error && <p className="note-error">{t("providerBilling.error")}</p>}

      {billing.legacySubscription.stripeSubscriptionId && <section className="billing-migration-notice">
        <div><strong>{t("providerBilling.migrationTitle")}</strong><p>{t("providerBilling.migrationDescription")}</p></div>
        <span>{t(`providerBilling.subscription.${billing.legacySubscription.status}` as TranslationKey)}{billing.legacySubscription.currentPeriodEnd ? ` · ${formatDateTime(language, billing.legacySubscription.currentPeriodEnd)}` : ""}</span>
      </section>}

      <section className="location-subscriptions">
        <div className="location-subscriptions-title"><div><h2>{t("providerBilling.locationsTitle")}</h2><p>{t("providerBilling.locationsDescription")}</p></div><strong>{money(language, billing.plan.monthlyPriceCents, billing.plan.currency)} / {t("providerBilling.month")}</strong></div>
        <div className="location-subscription-grid">{billing.locations.map((workshop) => {
          const canSubscribe = ["not_started", "incomplete_expired", "canceled"].includes(workshop.subscriptionStatus);
          return <article className={`location-subscription-card coverage-${workshop.coverageState}`} key={workshop.workshopId}>
            <header><div><h3>{workshop.displayName}</h3><p>{workshop.city ?? billing.displayName}</p></div><b>{t(`organisationCoverage.coverage.${workshop.coverageState}` as TranslationKey)}</b></header>
            <dl><div><dt>{t("providerBilling.status")}</dt><dd>{t(`providerBilling.subscription.${workshop.subscriptionStatus}` as TranslationKey)}</dd></div><div><dt>{t("providerBilling.renews")}</dt><dd>{workshop.currentPeriodEnd ? formatDateTime(language, workshop.currentPeriodEnd) : "—"}</dd></div></dl>
            {workshop.coverageGraceEndsAt && workshop.coverageState === "grace" && <p className="location-grace">{t("providerBilling.graceUntil")} {formatDateTime(language, workshop.coverageGraceEndsAt)}</p>}
            <div className="provider-subscription-actions">
              {stripeConfigured && canSubscribe && <form action={startStripeCheckoutAction}><input type="hidden" name="providerId" value={billing.providerId} /><input type="hidden" name="workshopId" value={workshop.workshopId} /><button className="organization-action">{t("providerBilling.subscribeLocation")}</button></form>}
              {workshop.cancelAtPeriodEnd && <small>{t("providerBilling.cancelsAtPeriodEnd")}</small>}
            </div>
          </article>;
        })}</div>
        {!billing.locations.length && <p className="catalogue-empty">{t("providerBilling.noLocations")}</p>}
        {!stripeConfigured && <p className="note-error">{t("providerBilling.notConfigured")}</p>}
        {stripeConfigured && hasCustomer && <form action={openStripePortalAction} className="billing-portal-form"><input type="hidden" name="providerId" value={billing.providerId} /><button>{t("providerBilling.portal")}</button></form>}
      </section>

      <details className="billing-accordion" open>
        <summary><span><strong>{t("providerBilling.profileTitle")}</strong><small>{t("providerBilling.profileDescription")}</small></span></summary>
        <form className="provider-billing-profile" action={profileAction}>
          <input type="hidden" name="providerId" value={billing.providerId} />
          <label>{t("providerBilling.billingEmail")}<input name="billingEmail" type="email" defaultValue={billing.billingProfile.billingEmail ?? ""} /></label>
          <label>{t("providerBilling.billingContact")}<input name="billingContact" defaultValue={billing.billingProfile.billingContact ?? ""} /></label>
          <label>{t("providerBilling.taxIdentifier")}<input name="taxIdentifier" defaultValue={billing.billingProfile.taxIdentifier ?? ""} /></label>
          <label>{t("providerBilling.addressLine1")}<input name="addressLine1" defaultValue={billing.billingProfile.addressLine1 ?? ""} /></label>
          <label>{t("providerBilling.addressLine2")}<input name="addressLine2" defaultValue={billing.billingProfile.addressLine2 ?? ""} /></label>
          <label>{t("providerBilling.city")}<input name="city" defaultValue={billing.billingProfile.city ?? ""} /></label>
          <label>{t("providerBilling.postalCode")}<input name="postalCode" defaultValue={billing.billingProfile.postalCode ?? ""} /></label>
          <label>{t("providerBilling.country")}<input name="countryCode" minLength={2} maxLength={2} defaultValue={billing.billingProfile.countryCode} required /></label>
          <button disabled={pending}>{t(pending ? "workspace.saving" : "workspace.save")}</button>
          {state.status !== "idle" && <p className={state.status === "saved" ? "note-success" : "note-error"}>{t(`providerBilling.result.${state.status}` as TranslationKey)}</p>}
        </form>
      </details>

      <section className="provider-invoices">
        <h2>{t("providerBilling.invoices")}</h2>
        {billing.invoices.length ? <div className="billing-table-wrap"><table><thead><tr><th>{t("providerBilling.location")}</th><th>{t("providerBilling.invoice")}</th><th>{t("providerBilling.period")}</th><th>{t("providerBilling.status")}</th><th>{t("providerBilling.amount")}</th><th>{t("providerBilling.documents")}</th></tr></thead><tbody>{billing.invoices.map((invoice) => <tr key={invoice.id}><td>{invoice.workshopName ?? t("providerBilling.legacyOrganisation")}</td><td>{invoice.number ?? "—"}</td><td>{invoice.periodStart ? formatDateTime(language, invoice.periodStart) : "—"}</td><td>{invoice.status}</td><td>{money(language, invoice.amountDueCents, invoice.currency)}</td><td>{invoice.hostedInvoiceUrl && <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer">{t("providerBilling.view")}</a>}{invoice.invoicePdfUrl && <a href={invoice.invoicePdfUrl} target="_blank" rel="noreferrer">PDF</a>}</td></tr>)}</tbody></table></div> : <p className="catalogue-empty">{t("providerBilling.noInvoices")}</p>}
      </section>
    </section>
  </main>;
}
