"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { BillingRate, PlatformBillingUsage } from "@/lib/dal/invoicing";
import { updateRatesAction, type RateState } from "./actions";

const euro = (cents: number, locale: string) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);

const initialRate: RateState = { status: "idle" };
export default function PlatformBillingClient({ usage, rates, displayName, logoutAction }: { usage: PlatformBillingUsage[]; rates: BillingRate[]; displayName: string; logoutAction: () => Promise<void> }) {
  const [language, setLanguage, ready] = useLanguage();
  const [payerKind, setPayerKind] = useState<"all" | "clinic" | "doctor">("all");
  const [rateState, rateAction, ratePending] = useActionState(updateRatesAction, initialRate);
  const t = (key: TranslationKey) => translate(language, key);
  const months = useMemo(() => [...new Set(usage.map((row) => row.month))], [usage]);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  return <main className="billing-shell"><header className="settings-topbar"><Link href="/admin">← {t("invoicing.back")}</Link><strong>VitaPass · {displayName}</strong><select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select><form action={logoutAction}><button>{t("auth.logout")}</button></form></header>
    <section className="billing-content"><p className="registration-kicker">{t("billing.accountingEyebrow")}</p><h1>{t("billing.platformTitle")}</h1><p>{t("billing.platformDescription")}</p>
      <nav className="billing-tabs"><button className={payerKind === "all" ? "active" : ""} onClick={() => setPayerKind("all")}>{t("billing.allPayers")}</button><button className={payerKind === "clinic" ? "active" : ""} onClick={() => setPayerKind("clinic")}>{t("billing.clinics")}</button><button className={payerKind === "doctor" ? "active" : ""} onClick={() => setPayerKind("doctor")}>{t("billing.independentDoctors")}</button></nav>
      <details className="billing-accordion"><summary><span><strong>{t("billing.pricing")}</strong><small>{t("billing.pricingHelp")}</small></span></summary><form className="billing-rate-form" action={rateAction}><label>{t("billing.nextSubscription")}<input type="number" name="subscription" min="0" step="0.01" defaultValue={((rates.find((rate) => rate.effectiveMonth > months[0]) ?? rates[0])?.subscriptionCents ?? 2000) / 100} /></label><label>{t("billing.nextSms")}<input type="number" name="sms" min="0" step="0.01" defaultValue={((rates.find((rate) => rate.effectiveMonth > months[0]) ?? rates[0])?.smsUnitCents ?? 10) / 100} /></label><button disabled={ratePending}>{t(ratePending ? "workspace.saving" : "workspace.save")}</button>{rateState.status !== "idle" && <p className={rateState.status === "saved" ? "note-success" : "note-error"}>{t(`billing.rateStatus.${rateState.status}` as TranslationKey)}</p>}</form></details>
      <div className="billing-months">{months.map((month, index) => { const rows = usage.filter((row) => row.month === month && (payerKind === "all" || row.payerKind === payerKind)); const closed = month < months[0]; return <details className="billing-accordion" key={month} open={index === 0}><summary><span><strong>{new Intl.DateTimeFormat(language, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}T00:00:00Z`))}</strong><small>{t(closed ? "billing.closed" : "billing.open")}</small></span><b>{euro(rows.reduce((sum, row) => sum + row.totalCents, 0), language)}</b></summary>
        <div className="billing-table-wrap"><table><thead><tr><th>{t("billing.payer")}</th><th>{t("billing.payerType")}</th><th>{t("billing.sponsoredDoctors")}</th><th>{t("billing.smsSent")}</th><th>{t("billing.total")}</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.payerKind}-${row.payerId}`}><td>{row.payerName}</td><td>{t(row.payerKind === "clinic" ? "billing.clinic" : "billing.independentDoctor")}</td><td>{row.doctorCount}</td><td>{row.smsCount}</td><td>{euro(row.totalCents, language)}</td></tr>)}</tbody></table></div>
        {closed && <a className="billing-export" href={`/api/billing-export?scope=platform&month=${month}`}>{t("billing.downloadCsv")}</a>}
      </details>; })}</div>
    </section></main>;
}
