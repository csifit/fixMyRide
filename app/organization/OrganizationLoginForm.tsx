"use client";

import Link from "next/link";
import { useActionState } from "react";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import {
  organizationLoginAction,
  type OrganizationLoginState,
} from "./actions";

const initialState: OrganizationLoginState = { error: null };

export default function OrganizationLoginForm({
  portal,
  configured,
}: {
  portal: "clinic_manager" | "staff";
  configured: boolean;
}) {
  const [language, setLanguage, ready] = useLanguage();
  const [state, action, pending] = useActionState(
    organizationLoginAction,
    initialState,
  );
  const t = (key: TranslationKey) => translate(language, key);
  return (
    <main className={`auth-shell ${ready ? "" : "i18n-pending"}`}>
      <section className="auth-card">
        <header>
          <Link className="auth-brand" href="/"><span>+</span>pitster</Link>
          <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label={t("a11y.languageSelector")}>
            <option value="en">{t("language.en")}</option><option value="de">{t("language.de")}</option><option value="ro">{t("language.ro")}</option><option value="hu">{t("language.hu")}</option>
          </select>
        </header>
        <div className="auth-intro">
          <span>+</span>
          <h1>{t(`organization.${portal}.loginTitle` as TranslationKey)}</h1>
          <p>{t(`organization.${portal}.loginDescription` as TranslationKey)}</p>
        </div>
        {!configured ? <p className="auth-error">{t("auth.configuration.description")}</p> : (
          <form action={action}>
            <input type="hidden" name="portal" value={portal} />
            <label>{t("auth.login.email")}<input name="email" type="email" required autoComplete="email" /></label>
            <label>{t("auth.login.password")}<input name="password" type="password" required minLength={8} autoComplete="current-password" /></label>
            {state.error && <p className="auth-error" role="alert">{t(state.error === "configuration" ? "auth.configuration.description" : `auth.login.${state.error}` as TranslationKey)}</p>}
            <button disabled={pending}>{t(pending ? "auth.login.submitting" : "auth.login.submit")}</button>
          </form>
        )}
      </section>
    </main>
  );
}

