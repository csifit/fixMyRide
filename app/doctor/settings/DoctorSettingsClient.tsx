"use client";

import Link from "next/link";
import { useActionState } from "react";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { DoctorWorkspace } from "@/lib/dal/workspaces";
import { updateDoctorProfileAction, updateWorkspaceAction, type SettingsState } from "./actions";

const initial: SettingsState = { status: "idle" };
function Status({ state, t }: { state: SettingsState; t: (key: TranslationKey) => string }) {
  if (state.status === "idle") return null;
  return <p className={state.status === "saved" ? "note-success" : "note-error"} role="status">{t(`workspace.status.${state.status}` as TranslationKey)}</p>;
}

export default function DoctorSettingsClient({ workspace, logoutAction }: { workspace: DoctorWorkspace; logoutAction: () => Promise<void> }) {
  const [language, setLanguage, ready] = useLanguage();
  const [profileState, profileAction, profilePending] = useActionState(updateDoctorProfileAction, initial);
  const [workspaceState, workspaceAction, workspacePending] = useActionState(updateWorkspaceAction, initial);
  const t = (key: TranslationKey) => translate(language, key);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  return <main className="settings-shell">
    <header className="settings-topbar"><Link href="/doctor">← {t("workspace.back")}</Link><strong>VitaPass</strong><select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label={t("a11y.languageSelector")}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select><form action={logoutAction}><button>{t("auth.logout")}</button></form></header>
    <section className="settings-content">
      <p className="registration-kicker">{t("workspace.eyebrow")}</p><h1>{t("workspace.doctorTitle")}</h1><p>{t("workspace.doctorDescription")}</p>
      <div className="settings-grid">
        <form className="settings-card" action={profileAction}>
          <h2>{t("workspace.profileTitle")}</h2><p>{t("workspace.profileHelp")}</p>
          <label>{t("workspace.bio")}<textarea name="professionalBio" defaultValue={workspace.professionalBio ?? ""} rows={6} /></label>
          <div className="settings-two"><label>{t("workspace.phone")}<input name="publicPhone" defaultValue={workspace.publicPhone ?? ""} /></label><label>{t("workspace.email")}<input type="email" name="publicEmail" defaultValue={workspace.publicEmail ?? ""} /></label></div>
          <div className="settings-two"><label>{t("workspace.experience")}<input type="number" name="yearsExperience" min={0} max={70} defaultValue={workspace.yearsExperience ?? ""} /></label><label>{t("workspace.languages")}<input name="spokenLanguages" defaultValue={workspace.spokenLanguages.join(", ")} /></label></div>
          <label className="settings-check"><input type="checkbox" name="acceptsNewPatients" defaultChecked={workspace.acceptsNewPatients} /> {t("workspace.acceptsPatients")}</label>
          <Status state={profileState} t={t} /><button disabled={profilePending}>{t(profilePending ? "workspace.saving" : "workspace.save")}</button>
        </form>
        <form className="settings-card" action={workspaceAction}>
          <h2>{t("workspace.clinicTitle")}</h2>
          {!workspace.isIndependent && <div className="settings-lock"><strong>{t("workspace.managedClinic")}</strong><p>{t("workspace.managedClinicHelp")}</p></div>}
          <fieldset disabled={!workspace.canEditWorkspace || workspacePending}>
            <label>{t("workspace.clinicName")}<input name="clinicName" defaultValue={workspace.clinicName} /></label>
            <div className="settings-two"><label>{t("workspace.country")}<input name="clinicCountry" maxLength={2} defaultValue={workspace.clinicCountry} /></label><label>{t("workspace.city")}<input name="city" defaultValue={workspace.city ?? ""} /></label></div>
            <label>{t("workspace.address")}<input name="practiceAddress" defaultValue={workspace.practiceAddress ?? ""} /></label>
            <div className="settings-two"><label>{t("workspace.latitude")}<input type="number" step="any" name="latitude" defaultValue={workspace.latitude ?? ""} /></label><label>{t("workspace.longitude")}<input type="number" step="any" name="longitude" defaultValue={workspace.longitude ?? ""} /></label></div>
          </fieldset>
          {workspace.canEditWorkspace && <><Status state={workspaceState} t={t} /><button disabled={workspacePending}>{t(workspacePending ? "workspace.saving" : "workspace.save")}</button></>}
        </form>
      </div>
    </section>
  </main>;
}
