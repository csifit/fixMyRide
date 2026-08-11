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

export default function ProviderBillingClient({ billing, providers, stripeConfigured, notice, error, claimState, claimWorkshopId, logoutAction, portalBasePath = "/workshop-manager" }: {
  billing: ProviderBilling;
  providers: Array<{ id: string; displayName: string }>;
  stripeConfigured: boolean;
  notice: string | null;
  error: string | null;
  claimState: string | null;
  claimWorkshopId: string | null;
  logoutAction: () => Promise<void>;
  portalBasePath?: string;
}) {
  const [language, setLanguage, ready] = useLanguage();
  const [state, profileAction, pending] = useActionState(
    updateProviderBillingProfileAction,
    idle,
  );
  const t = (key: TranslationKey) => translate(language, key);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  const hasCustomer = Boolean(billing.stripeCustomerId);
  const completingClaimDetails = claimState === "details_required";
  const subscription = billing.organisationSubscription;
  const paymentAttention = Boolean(subscription.paymentGraceEndsAt)
    || ["past_due", "unpaid"].includes(subscription.status);

  return <main className="billing-shell">
    <header className="settings-topbar">
      <Link href={portalBasePath}>← {t("workspace.back")}</Link>
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
        {providers.length > 1 && <label>{t("providerBilling.provider")}<select value={billing.providerId} onChange={(event) => location.assign(`${portalBasePath}${portalBasePath === "/service-organisation" ? "/billing" : "/invoicing"}?providerId=${event.target.value}`)}>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}</select></label>}
      </div>
      {notice === "success" && <p className="note-success">{t("providerBilling.checkoutSuccess")}</p>}
      {notice === "cancelled" && <p className="note-error">{t("providerBilling.checkoutCancelled")}</p>}
      {error && <p className="note-error">{t("providerBilling.error")}</p>}
      {claimWorkshopId && ["details_required", "payment_required"].includes(claimState ?? "") && <section className="billing-migration-notice workshop-claim-notice">
        <div><strong>{t(claimState === "details_required" ? "providerBilling.claimDetailsTitle" : "providerBilling.claimPaymentTitle")}</strong><p>{t(claimState === "details_required" ? "providerBilling.claimDetailsDescription" : "providerBilling.claimPaymentDescription")}</p></div>
        <Link href={`/workshops/${claimWorkshopId}`}>{t("providerBilling.claimReturn")}</Link>
      </section>}

      {paymentAttention && <section className="billing-migration-notice payment-attention-notice">
        <div><strong>{t("providerBilling.paymentAttentionTitle")}</strong><p>{t("providerBilling.paymentAttentionDescription")}</p></div>
        <span>{subscription.paymentGraceEndsAt ? `${t("providerBilling.graceUntil")} ${formatDateTime(language, subscription.paymentGraceEndsAt)}` : t(`providerBilling.subscription.${subscription.status}` as TranslationKey)}</span>
      </section>}

      <section className="organisation-billing-summary">
        <article><span>{t("providerBilling.coveredLocations")}</span><strong>{subscription.billingQuantity}</strong></article>
        <article><span>{t("providerBilling.nextPayment")}</span><strong>{formatDateTime(language, subscription.nextBillingAt)}</strong></article>
        <article><span>{t("providerBilling.upcomingTotal")}</span><strong>{money(language, subscription.upcomingAmountCents, billing.plan.currency)}</strong></article>
        <article><span>{t("providerBilling.status")}</span><strong>{t(`providerBilling.subscription.${subscription.status}` as TranslationKey)}</strong></article>
      </section>

      <section className="location-subscriptions">
        <div className="location-subscriptions-title"><div><h2>{t("providerBilling.locationsTitle")}</h2><p>{t("providerBilling.locationsDescription")}</p></div><strong>{money(language, billing.plan.monthlyPriceCents, billing.plan.currency)} / {t("providerBilling.locationPerMonth")}</strong></div>
        <div className="location-subscription-grid">{billing.locations.map((workshop) => {
          const canActivate = !workshop.legacyStripeSubscriptionId
            && ["uncovered", "grace"].includes(workshop.coverageState)
            && !paymentAttention;
          const isFreeUntilNextMonth = workshop.billableFrom?.slice(0, 10)
            === subscription.nextBillingAt.slice(0, 10);
          return <article className={`location-subscription-card coverage-${workshop.coverageState}`} key={workshop.workshopId}>
            <header><div><h3>{workshop.displayName}</h3><p>{workshop.city ?? billing.displayName}</p></div><b>{t(`organisationCoverage.coverage.${workshop.coverageState}` as TranslationKey)}</b></header>
            <dl><div><dt>{t("providerBilling.status")}</dt><dd>{workshop.coverageStartedAt ? t("providerBilling.locationActive") : t("providerBilling.locationAwaitingBilling")}</dd></div><div><dt>{t("providerBilling.billableFrom")}</dt><dd>{workshop.billableFrom ? formatDateTime(language, workshop.billableFrom) : "—"}</dd></div></dl>
            {isFreeUntilNextMonth && <p className="location-grace">{t("providerBilling.freeUntilNextMonth")}</p>}
            {workshop.coverageState === "grace" && workshop.coverageGraceEndsAt && <p className="location-grace">{t("providerBilling.migrationTitle")} · {formatDateTime(language, workshop.coverageGraceEndsAt)}</p>}
            {workshop.legacyStripeSubscriptionId && <p className="location-grace">{t("providerBilling.legacyLocationBilling")}</p>}
            <div className="provider-subscription-actions">
              {stripeConfigured && canActivate && <form action={startStripeCheckoutAction}><input type="hidden" name="providerId" value={billing.providerId} /><input type="hidden" name="workshopId" value={workshop.workshopId} /><button className="organization-action">{t("providerBilling.activateLocation")}</button></form>}
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
          <label>{t("providerBilling.billingEmail")}<input name="billingEmail" type="email" defaultValue={billing.billingProfile.billingEmail ?? ""} required={completingClaimDetails} /></label>
          <label>{t("providerBilling.billingContact")}<input name="billingContact" defaultValue={billing.billingProfile.billingContact ?? ""} required={completingClaimDetails} /></label>
          <label>{t("providerBilling.taxIdentifier")}<input name="taxIdentifier" defaultValue={billing.billingProfile.taxIdentifier ?? ""} required={completingClaimDetails} /></label>
          <label>{t("providerBilling.addressLine1")}<input name="addressLine1" defaultValue={billing.billingProfile.addressLine1 ?? ""} required={completingClaimDetails} /></label>
          <label>{t("providerBilling.addressLine2")}<input name="addressLine2" defaultValue={billing.billingProfile.addressLine2 ?? ""} /></label>
          <label>{t("providerBilling.city")}<input name="city" defaultValue={billing.billingProfile.city ?? ""} required={completingClaimDetails} /></label>
          <label>{t("providerBilling.postalCode")}<input name="postalCode" defaultValue={billing.billingProfile.postalCode ?? ""} required={completingClaimDetails} /></label>
          <label>{t("providerBilling.country")}<input name="countryCode" minLength={2} maxLength={2} defaultValue={billing.billingProfile.countryCode} required /></label>
          <button disabled={pending}>{t(pending ? "workspace.saving" : "workspace.save")}</button>
          {state.status !== "idle" && <p className={state.status === "saved" ? "note-success" : "note-error"}>{t(`providerBilling.result.${state.status}` as TranslationKey)}</p>}
        </form>
      </details>

      <section className="provider-invoices">
        <h2>{t("providerBilling.invoices")}</h2>
        {billing.invoices.length ? <div className="billing-table-wrap"><table><thead><tr><th>{t("providerBilling.invoice")}</th><th>{t("providerBilling.period")}</th><th>{t("providerBilling.status")}</th><th>{t("providerBilling.amount")}</th><th>{t("providerBilling.documents")}</th></tr></thead><tbody>{billing.invoices.map((invoice) => <tr key={invoice.id}><td>{invoice.number ?? "—"}</td><td>{invoice.periodStart ? formatDateTime(language, invoice.periodStart) : "—"}</td><td>{invoice.status}</td><td>{money(language, invoice.amountDueCents, invoice.currency)}</td><td>{invoice.hostedInvoiceUrl && <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer">{t("providerBilling.view")}</a>}{invoice.invoicePdfUrl && <a href={invoice.invoicePdfUrl} target="_blank" rel="noreferrer">PDF</a>}</td></tr>)}</tbody></table></div> : <p className="catalogue-empty">{t("providerBilling.noInvoices")}</p>}
      </section>
    </section>
  </main>;
}
