"use client";

import Link from "next/link";
import { useActionState } from "react";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { adminLoginAction, type AdminLoginState } from "../actions";

const initialState: AdminLoginState = { error: null };

export default function AdminLoginForm({
  configured,
}: {
  configured: boolean;
}) {
  const [language, setLanguage, ready] = useLanguage();
  const [state, action, pending] = useActionState(
    adminLoginAction,
    initialState,
  );
  const t = (key: TranslationKey) => translate(language, key);
  const errorKey: TranslationKey | null =
    state.error === "configuration"
      ? "admin.access.configuration.description"
      : state.error
        ? `admin.login.${state.error}` as TranslationKey
        : null;

  return (
    <main className={`auth-shell ${ready ? "" : "i18n-pending"}`}>
      <section className="auth-card">
        <header>
          <Link className="auth-brand" href="/">
            <span>+</span>pitster
          </Link>
          <label className="language">
            <span aria-hidden="true">◎</span>
            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as typeof language)
              }
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
          <span>⌾</span>
          <h1>{t("admin.login.title")}</h1>
          <p>{t("admin.login.description")}</p>
        </div>
        {!configured ? (
          <div className="auth-message warning" role="status">
            <strong>{t("admin.access.configuration.title")}</strong>
            <p>{t("admin.access.configuration.description")}</p>
          </div>
        ) : (
          <form action={action}>
            <label>
              {t("admin.login.email")}
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </label>
            <label>
              {t("admin.login.password")}
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
              />
            </label>
            {errorKey && (
              <p className="auth-error" role="alert">
                {t(errorKey)}
              </p>
            )}
            <button type="submit" disabled={pending}>
              {t(
                pending
                  ? "admin.login.submitting"
                  : "admin.login.submit",
              )}
            </button>
          </form>
        )}
        <small>{t("admin.login.noSignup")}</small>
      </section>
    </main>
  );
}
