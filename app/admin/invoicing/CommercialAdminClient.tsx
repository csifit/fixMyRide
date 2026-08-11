"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { formatDateTime, locales, translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { CommercialAdminData } from "@/lib/dal/commercial-admin";
import { updateServiceProviderStatusAction, type CommercialAdminActionState } from "./commercial-actions";

const idle: CommercialAdminActionState = { status: "idle" };
const money = (language: Language, cents: number, currency = "EUR") =>
  new Intl.NumberFormat(locales[language], { style: "currency", currency }).format(cents / 100);

function StatusForm({ providerId, currentStatus, t }: { providerId: string; currentStatus: string; t: (key: TranslationKey) => string }) {
  const [state, action, pending] = useActionState(updateServiceProviderStatusAction, idle);
  return <form className="commercial-status-form" action={action}>
    <input type="hidden" name="providerId" value={providerId} />
    <select name="providerStatus" defaultValue={currentStatus}>
      <option value="pending">{t("commercialAdmin.providerStatus.pending")}</option>
      <option value="active">{t("commercialAdmin.providerStatus.active")}</option>
      <option value="suspended">{t("commercialAdmin.providerStatus.suspended")}</option>
      <option value="rejected">{t("commercialAdmin.providerStatus.rejected")}</option>
    </select>
    <input name="reason" minLength={2} maxLength={500} placeholder={t("commercialAdmin.reason")} required />
    <button disabled={pending}>{t(pending ? "workspace.saving" : "workspace.save")}</button>
    {state.status !== "idle" && <small className={state.status === "saved" ? "note-success" : "note-error"}>{t(`commercialAdmin.result.${state.status}` as TranslationKey)}</small>}
  </form>;
}

export default function CommercialAdminClient({ data, displayName, canManageStatus, logoutAction }: { data: CommercialAdminData; displayName: string; canManageStatus: boolean; logoutAction: () => Promise<void> }) {
  const [language, setLanguage, ready] = useLanguage();
  const [filter, setFilter] = useState("all");
  const t = (key: TranslationKey) => translate(language, key);
  const providers = useMemo(
    () => data.providers.filter((provider) => filter === "all" || provider.subscriptionStatus === filter),
    [data.providers, filter],
  );
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  return <main className="billing-shell">
    <header className="settings-topbar">
      <Link href="/admin">← {t("invoicing.back")}</Link><strong>pitster · {displayName}</strong>
      <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select>
      <form action={logoutAction}><button>{t("auth.logout")}</button></form>
    </header>
    <section className="billing-content commercial-admin-content">
      <p className="registration-kicker">{t("commercialAdmin.eyebrow")}</p><h1>{t("commercialAdmin.title")}</h1><p>{t("commercialAdmin.description")}</p>
      <div className="commercial-metrics">
        <article><strong>{data.counts.providers}</strong><span>{t("commercialAdmin.providers")}</span></article>
        <article><strong>{data.counts.locations}</strong><span>{t("commercialAdmin.locations")}</span></article>
        <article><strong>{data.counts.activeSubscriptions}</strong><span>{t("commercialAdmin.activeSubscriptions")}</span></article>
        <article><strong>{data.counts.attention}</strong><span>{t("commercialAdmin.attention")}</span></article>
        <article><strong>{money(language, data.counts.monthlyRecurringCents)}</strong><span>{t("commercialAdmin.upcomingTotal")}</span></article>
      </div>
      <div className="booking-inbox-toolbar"><strong>{providers.length} {t("commercialAdmin.providers")}</strong><label>{t("workshopBookings.filter")}<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">{t("workshopBookings.filter.all")}</option><option value="active">{t("providerBilling.subscription.active")}</option><option value="trialing">{t("providerBilling.subscription.trialing")}</option><option value="incomplete">{t("providerBilling.subscription.incomplete")}</option><option value="past_due">{t("providerBilling.subscription.past_due")}</option><option value="unpaid">{t("providerBilling.subscription.unpaid")}</option><option value="not_started">{t("providerBilling.subscription.not_started")}</option><option value="canceled">{t("providerBilling.subscription.canceled")}</option></select></label><a className="billing-export" href="/api/billing-export?scope=commercial">{t("billing.downloadCsv")}</a></div>
      <div className="billing-table-wrap"><table><thead><tr><th>{t("commercialAdmin.provider")}</th><th>{t("commercialAdmin.providerStatus")}</th><th>{t("commercialAdmin.subscription")}</th><th>{t("commercialAdmin.coveredLocations")}</th><th>{t("commercialAdmin.nextInvoice")}</th><th>{t("commercialAdmin.paymentHistory")}</th>{canManageStatus && <th>{t("commercialAdmin.operation")}</th>}</tr></thead><tbody>{providers.map((provider) => <tr key={provider.id}>
        <td><strong>{provider.displayName}</strong><small>{provider.legalName}</small></td>
        <td>{t(`commercialAdmin.providerStatus.${provider.providerStatus}` as TranslationKey)}</td>
        <td><b>{t(`providerBilling.subscription.${provider.subscriptionStatus}` as TranslationKey)}</b>{provider.paymentGraceEndsAt && <small className="payment-attention-text">{t("providerBilling.graceUntil")} {formatDateTime(language, provider.paymentGraceEndsAt)}</small>}</td>
        <td><strong>{provider.activeLocationCount}</strong><small>{money(language, provider.monthlyPriceCents, provider.currency)} × {provider.activeLocationCount}</small></td>
        <td><strong>{money(language, provider.upcomingAmountCents, provider.currency)}</strong><small>{formatDateTime(language, provider.nextBillingAt)}</small></td>
        <td>{provider.invoices.length ? <div className="commercial-invoice-history">{provider.invoices.map((invoice) => <span key={invoice.id}><b>{invoice.periodStart ? formatDateTime(language, invoice.periodStart) : invoice.number ?? "—"}</b>{invoice.status} · {money(language, invoice.amountPaidCents || invoice.amountDueCents, provider.currency)}</span>)}</div> : <small>{t("commercialAdmin.noPaymentHistory")}</small>}</td>
        {canManageStatus && <td><StatusForm providerId={provider.id} currentStatus={provider.providerStatus} t={t} /></td>}
      </tr>)}</tbody></table></div>
    </section>
  </main>;
}
