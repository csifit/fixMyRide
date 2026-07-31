"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { brand } from "@/lib/brand";
import { patientLoginAction, type PatientLoginState } from "../actions";

const initial: PatientLoginState = { error: null, success: false };

export default function PatientLoginForm({ configured }: { configured: boolean }) {
  const [language, setLanguage, ready] = useLanguage();
  const [state, action, pending] = useActionState(patientLoginAction, initial);
  const t = (key: TranslationKey) => translate(language, key);
  useEffect(() => {
    if (state.success) window.location.assign("/patient/appointments");
  }, [state.success]);
  const errorKey = state.error
    ? `patientAppointments.login.${state.error}` as TranslationKey
    : null;
  return <main className={`auth-shell ${ready ? "" : "i18n-pending"}`}>
    <section className="auth-card">
      <header>
        <Link className="auth-brand" href="/"><span>{brand.mark}</span>{brand.name}</Link>
        <label className="language"><select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label={t("a11y.languageSelector")}>
          <option value="en">{t("language.en")}</option><option value="de">{t("language.de")}</option><option value="ro">{t("language.ro")}</option><option value="hu">{t("language.hu")}</option>
        </select></label>
      </header>
      <div className="auth-intro"><span>♡</span><h1>{t("patientAppointments.login.title")}</h1><p>{t("patientAppointments.login.description")}</p></div>
      {!configured ? <div className="auth-message warning"><p>{t("patientAppointments.login.configuration")}</p></div> : <form action={action}>
        <label>{t("auth.login.email")}<input name="email" type="email" autoComplete="email" required /></label>
        <label>{t("auth.login.password")}<input name="password" type="password" autoComplete="current-password" required minLength={8} /></label>
        {errorKey && <p className="auth-error" role="alert">{t(errorKey)}</p>}
        <button disabled={pending || state.success}>{t(pending ? "auth.login.submitting" : "auth.login.submit")}</button>
      </form>}
      <small>{t("patientAppointments.login.noAccount")} <Link href="/register/patient">{t("booking.createAccount")}</Link></small>
    </section>
  </main>;
}
