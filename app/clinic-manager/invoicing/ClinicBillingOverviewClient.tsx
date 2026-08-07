"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { BillingProfile, ClinicBillingUsage } from "@/lib/dal/invoicing";
import { updateBillingAction, type BillingMutationState } from "@/app/organization/invoicing-actions";

type ClinicBilling = { id: string; name: string; profile: BillingProfile; usage: ClinicBillingUsage[] };
const initial: BillingMutationState = { status: "idle" };
const euro = (cents: number, locale: string) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);

function BillingDetails({ clinic, t }: { clinic: ClinicBilling; t: (key: TranslationKey) => string }) {
  const [state, action, pending] = useActionState(updateBillingAction, initial);
  return <details className="billing-accordion"><summary>{t("billing.details")}</summary><form className="billing-profile-form" action={action}>
    <input type="hidden" name="clinicId" value={clinic.id} />
    <label>{t("invoicing.legalName")}<input name="legalName" defaultValue={clinic.profile.legalName ?? ""} /></label>
    <label>{t("invoicing.fiscalIdentifier")}<input name="fiscalIdentifier" defaultValue={clinic.profile.fiscalIdentifier ?? ""} /></label>
    <label>{t("invoicing.vatIdentifier")}<input name="vatIdentifier" defaultValue={clinic.profile.vatIdentifier ?? ""} /></label>
    <label>{t("invoicing.tradeRegister")}<input name="tradeRegisterNumber" defaultValue={clinic.profile.tradeRegisterNumber ?? ""} /></label>
    <label>{t("invoicing.address")}<input name="billingAddress" defaultValue={clinic.profile.billingAddress ?? ""} /></label>
    <label>{t("invoicing.country")}<input name="billingCountry" defaultValue={clinic.profile.billingCountry ?? "RO"} maxLength={2} /></label>
    <label>{t("invoicing.email")}<input type="email" name="billingEmail" defaultValue={clinic.profile.billingEmail ?? ""} /></label>
    <label>{t("invoicing.contact")}<input name="billingContact" defaultValue={clinic.profile.billingContact ?? ""} /></label>
    {state.status !== "idle" && <p className={state.status === "saved" ? "note-success" : "note-error"}>{t(`invoicing.status.${state.status}` as TranslationKey)}</p>}
    <button disabled={pending}>{t(pending ? "invoicing.saving" : "invoicing.save")}</button>
  </form></details>;
}

export default function ClinicBillingOverviewClient({ clinics, logoutAction }: { clinics: ClinicBilling[]; logoutAction: () => Promise<void> }) {
  const [language, setLanguage, ready] = useLanguage();
  const [selectedId, setSelectedId] = useState(clinics[0]?.id ?? "");
  const t = (key: TranslationKey) => translate(language, key);
  const clinic = clinics.find((item) => item.id === selectedId) ?? clinics[0];
  const months = useMemo(() => clinic ? [...new Set(clinic.usage.map((item) => item.month))] : [], [clinic]);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  return <main className="billing-shell"><header className="settings-topbar"><Link href="/clinic-manager">← {t("invoicing.back")}</Link><strong>pitster</strong><select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select><form action={logoutAction}><button>{t("auth.logout")}</button></form></header>
    <section className="billing-content"><p className="registration-kicker">{t("billing.eyebrow")}</p><h1>{t("billing.clinicTitle")}</h1><p>{t("billing.clinicDescription")}</p>
      <nav className="billing-tabs">{clinics.map((item) => <button className={item.id === clinic?.id ? "active" : ""} key={item.id} onClick={() => setSelectedId(item.id)}>{item.name}</button>)}</nav>
      {!clinic && <p className="organization-card">{t("organization.clinicsEmpty")}</p>}
      {clinic && <><div className="billing-summary"><div><span>{t("billing.sponsoredDoctors")}</span><strong>{new Set(clinic.usage.filter((row) => row.month === months[0]).map((row) => row.clinicianId)).size}</strong></div><div><span>{t("billing.smsSent")}</span><strong>{clinic.usage.filter((row) => row.month === months[0]).reduce((sum, row) => sum + row.smsCount, 0)}</strong></div><div><span>{t("billing.currentTotal")}</span><strong>{euro(clinic.usage.filter((row) => row.month === months[0]).reduce((sum, row) => sum + row.totalCents, 0), language)}</strong></div></div>
        <BillingDetails clinic={clinic} t={t} />
        <div className="billing-months">{months.map((month, index) => { const rows = clinic.usage.filter((row) => row.month === month); const closed = rows[0]?.status === "closed"; return <details className="billing-accordion" key={month} open={index === 0}><summary><span><strong>{new Intl.DateTimeFormat(language, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}T00:00:00Z`))}</strong><small>{t(closed ? "billing.closed" : "billing.open")}</small></span><b>{euro(rows.reduce((sum, row) => sum + row.totalCents, 0), language)}</b></summary>
          <div className="billing-table-wrap"><table><thead><tr><th>{t("billing.doctor")}</th><th>{t("billing.subscription")}</th><th>{t("billing.smsSent")}</th><th>{t("billing.smsCost")}</th><th>{t("billing.total")}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.clinicianId}><td>{row.clinicianName}</td><td>{euro(row.subscriptionCents, language)}</td><td>{row.smsCount}</td><td>{euro(row.smsCount * row.smsUnitCents, language)}</td><td>{euro(row.totalCents, language)}</td></tr>)}</tbody></table></div>
          {closed && <a className="billing-export" href={`/api/billing-export?scope=clinic&clinicId=${clinic.id}&month=${month}`}>{t("billing.downloadCsv")}</a>}
        </details>; })}</div></>}
    </section></main>;
}
