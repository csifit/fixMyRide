"use client";

import { useActionState } from "react";
import Link from "next/link";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { loginAction, type LoginState } from "../actions";

const initialState: LoginState = { error: null };

export default function LoginForm({ configured }: { configured: boolean }) {
  const [language, setLanguage, ready] = useLanguage();
  const [state, action, pending] = useActionState(loginAction, initialState);
  const t = (key: TranslationKey) => translate(language, key);
  const errorKey: TranslationKey | null =
    state.error === "configuration"
      ? "auth.configuration.description"
      : state.error
        ? `auth.login.${state.error}` as TranslationKey
        : null;

  return (
    <main className={`auth-shell ${ready ? "" : "i18n-pending"}`}>
      <section className="auth-card">
        <header>
          <Link className="auth-brand" href="/"><span>+</span>VitaPass</Link>
          <label className="language">
            <span aria-hidden="true">◎</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as typeof language)}
              aria-label={t("a11y.languageSelector")}
            >
              <option value="en">{t("language.en")}</option>
              <option value="de">{t("language.de")}</option>
              <option value="ro">{t("language.ro")}</option>
              <option value="hu">{t("language.hu")}</option>
            </select>
          </label>
        </header>
        <div className="auth-intro">
          <span>⚕</span>
          <h1>{t("auth.login.title")}</h1>
          <p>{t("auth.login.description")}</p>
        </div>
        {!configured ? (
          <div className="auth-message warning" role="status">
            <strong>{t("auth.configuration.title")}</strong>
            <p>{t("auth.configuration.description")}</p>
          </div>
        ) : (
          <form action={action}>
            <label>{t("auth.login.email")}<input name="email" type="email" autoComplete="email" required /></label>
            <label>{t("auth.login.password")}<input name="password" type="password" autoComplete="current-password" required minLength={8} /></label>
            {errorKey && <p className="auth-error" role="alert">{t(errorKey)}</p>}
            <button type="submit" disabled={pending}>{pending ? t("auth.login.submitting") : t("auth.login.submit")}</button>
          </form>
        )}
        <small>{t("auth.login.noSignup")}</small>
      </section>
    </main>
  );
}
