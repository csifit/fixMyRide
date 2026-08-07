"use client";

import Link from "next/link";
import { useActionState } from "react";
import { languages, translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import {
  setPasswordAction,
  type PasswordSetupState,
} from "./actions";

const initialState: PasswordSetupState = { status: "idle" };

export default function SetPasswordClient({
  authenticated,
  invalidLink,
}: {
  authenticated: boolean;
  invalidLink: boolean;
}) {
  const [language, setLanguage, ready] = useLanguage();
  const [state, action, pending] = useActionState(
    setPasswordAction,
    initialState,
  );
  const t = (key: TranslationKey) => translate(language, key);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;

  const canSetPassword = authenticated && !invalidLink;
  return (
    <main className="registration-shell">
      <section className="registration-card">
        <header className="registration-header">
          <Link href="/" className="registration-brand">pitster</Link>
          <select
            aria-label={t("a11y.languageSelector")}
            value={language}
            onChange={(event) =>
              setLanguage(event.target.value as typeof language)}
          >
            {languages.map((item) => (
              <option value={item} key={item}>{t(`language.${item}`)}</option>
            ))}
          </select>
        </header>
        <p className="registration-kicker">
          {t("register.setPassword.kicker")}
        </p>
        <h1>{t("register.setPassword.title")}</h1>
        <p>{t("register.setPassword.description")}</p>

        {canSetPassword ? (
          <form action={action}>
            <label>
              {t("register.password")}
              <input
                name="password"
                required
                type="password"
                minLength={8}
                maxLength={256}
                autoComplete="new-password"
              />
            </label>
            <label>
              {t("register.confirmPassword")}
              <input
                name="confirmPassword"
                required
                type="password"
                minLength={8}
                maxLength={256}
                autoComplete="new-password"
              />
            </label>
            {state.status !== "idle" && (
              <p className="note-error" role="alert">
                {t(`register.setPassword.status.${state.status}` as TranslationKey)}
              </p>
            )}
            <button disabled={pending}>
              {t(
                pending
                  ? "register.setPassword.submitting"
                  : "register.setPassword.submit",
              )}
            </button>
          </form>
        ) : (
          <div className="auth-message warning" role="alert">
            <strong>
              {t("register.setPassword.status.unauthorized")}
            </strong>
            <p>{t("register.setPassword.requestNewLink")}</p>
          </div>
        )}
        <nav className="registration-links">
          <Link href="/register">{t("register.setPassword.back")}</Link>
        </nav>
      </section>
    </main>
  );
}
