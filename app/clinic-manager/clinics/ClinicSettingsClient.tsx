"use client";

import Link from "next/link";
import { useActionState } from "react";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { ClinicWorkspace } from "@/lib/dal/workspaces";
import GoogleAddressSearch from "@/app/GoogleAddressSearch";
import { createClinicAction, updateClinicAction, type ClinicSettingsState } from "./actions";

const initial: ClinicSettingsState = { status: "idle" };
function Result({ state, t }: { state: ClinicSettingsState; t: (key: TranslationKey) => string }) {
  if (state.status === "idle") return null;
  return <p className={state.status === "saved" || state.status === "created" ? "note-success" : "note-error"}>{t(`workspace.status.${state.status}` as TranslationKey)}</p>;
}
function ClinicForm({ clinic, t, language }: { clinic: ClinicWorkspace; t: (key: TranslationKey) => string; language: "en" | "de" | "ro" | "hu" }) {
  const [state, action, pending] = useActionState(updateClinicAction, initial);
  return <details className="settings-accordion" open>
    <summary><span><strong>{clinic.displayName}</strong><small>{clinic.city || clinic.countryCode}</small></span><b>{clinic.status}</b></summary>
    <form className="settings-card" action={action}>
      <input type="hidden" name="clinicId" value={clinic.id} />
      <div className="settings-two"><label>{t("workspace.legalName")}<input name="legalName" defaultValue={clinic.legalName} /></label><label>{t("workspace.clinicName")}<input name="displayName" defaultValue={clinic.displayName} /></label></div>
      <label>{t("workspace.description")}<textarea name="description" rows={4} defaultValue={clinic.description ?? ""} /></label>
      <div className="settings-two"><label>{t("workspace.phone")}<input name="publicPhone" defaultValue={clinic.publicPhone ?? ""} /></label><label>{t("workspace.email")}<input type="email" name="publicEmail" defaultValue={clinic.publicEmail ?? ""} /></label></div>
      <GoogleAddressSearch label={t("workspace.address")} placeholder={t("home.addressSearchPlaceholder")} help={t("workspace.addressSearchHelp")} unavailable={t("workspace.addressSearchFallback")} language={language} initialAddress={clinic.address ?? ""} initialCity={clinic.city ?? ""} initialCountryCode={clinic.countryCode} initialLatitude={clinic.latitude} initialLongitude={clinic.longitude} disabled={pending} />
      <Result state={state} t={t} /><button disabled={pending}>{t(pending ? "workspace.saving" : "workspace.save")}</button>
    </form>
  </details>;
}

export default function ClinicSettingsClient({ clinics, logoutAction }: { clinics: ClinicWorkspace[]; logoutAction: () => Promise<void> }) {
  const [language, setLanguage, ready] = useLanguage();
  const [state, action, pending] = useActionState(createClinicAction, initial);
  const t = (key: TranslationKey) => translate(language, key);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  return <main className="settings-shell"><header className="settings-topbar"><Link href="/clinic-manager">← {t("workspace.back")}</Link><strong>pitster</strong><select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select><form action={logoutAction}><button>{t("auth.logout")}</button></form></header>
    <section className="settings-content"><p className="registration-kicker">{t("workspace.eyebrow")}</p><h1>{t("workspace.clinicsTitle")}</h1><p>{t("workspace.clinicsDescription")}</p>
      <div className="settings-accordions">{clinics.map((clinic) => <ClinicForm key={clinic.id} clinic={clinic} t={t} language={language} />)}</div>
      <details className="settings-accordion"><summary><strong>+ {t("workspace.addClinic")}</strong></summary><form className="settings-card" action={action}><label>{t("workspace.legalName")}<input name="legalName" required /></label><label>{t("workspace.clinicName")}<input name="displayName" required /></label><label>{t("workspace.country")}<input name="countryCode" defaultValue="RO" maxLength={2} required /></label><Result state={state} t={t} /><button disabled={pending}>{t(pending ? "workspace.saving" : "workspace.createClinic")}</button></form></details>
    </section></main>;
}
