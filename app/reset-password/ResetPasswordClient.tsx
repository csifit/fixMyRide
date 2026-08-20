"use client";

import Link from "next/link";
import { useActionState } from "react";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { brand } from "@/lib/brand";
import {
  recoveryLoginPaths,
  type RecoveryPortal,
} from "@/app/authentication/recovery";
import { resetPasswordAction, type ResetPasswordState } from "./actions";

const initialState: ResetPasswordState = { status: "idle" };

export default function ResetPasswordClient({
  authenticated,
  invalidLink,
  portal,
}: {
  authenticated: boolean;
  invalidLink: boolean;
  portal: RecoveryPortal;
}) {
  const [language, setLanguage, ready] = useLanguage();
  const [state, action, pending] = useActionState(resetPasswordAction, initialState);
  const t = (key: TranslationKey) => translate(language, key);
  const loginPath = recoveryLoginPaths[portal];
  const canReset = authenticated && !invalidLink && state.status !== "success";

  return (
    <main className={`auth-shell ${ready ? "" : "i18n-pending"}`}>
      <section className="auth-card status-card">
        <header>
          <Link className="auth-brand" href="/">
            <span>{brand.mark}</span>{brand.name}
          </Link>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as typeof language)}
            aria-label={t("a11y.languageSelector")}
          >
            <option value="en">EN</option>
            <option value="de">DE</option>
            <option value="ro">RO</option>
            <option value="hu">HU</option>
          </select>
        </header>
        <div className="auth-intro">
          <span>✓</span>
          <h1>{t("passwordRecovery.reset.title")}</h1>
          <p>{t("passwordRecovery.reset.description")}</p>
        </div>

        {state.status === "success" ? (
          <div className="auth-message recovery-success" role="status">
            <strong>{t("passwordRecovery.reset.successTitle")}</strong>
            <p>{t("passwordRecovery.reset.successDescription")}</p>
          </div>
        ) : canReset ? (
          <form action={action}>
            <input type="hidden" name="portal" value={portal} />
            <label>
              {t("passwordRecovery.reset.password")}
              <input
                name="password"
                type="password"
                required
                minLength={8}
                maxLength={256}
                autoComplete="new-password"
              />
            </label>
            <label>
              {t("passwordRecovery.reset.confirmPassword")}
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                maxLength={256}
                autoComplete="new-password"
              />
            </label>
            {state.status !== "idle" && (
              <p className="auth-error" role="alert">
                {t(`passwordRecovery.status.${state.status}` as TranslationKey)}
              </p>
            )}
            <button disabled={pending}>
              {t(pending
                ? "passwordRecovery.reset.submitting"
                : "passwordRecovery.reset.submit")}
            </button>
          </form>
        ) : (
          <div className="auth-message warning" role="alert">
            <strong>{t("passwordRecovery.status.unauthorized")}</strong>
            <p>{t("passwordRecovery.reset.requestNewLink")}</p>
          </div>
        )}

        <Link
          className="auth-return recovery-return"
          href={state.status === "success"
            ? loginPath
            : `/forgot-password?portal=${portal}`}
        >
          {t(state.status === "success"
            ? "passwordRecovery.backToLogin"
            : "passwordRecovery.reset.requestLink")}
        </Link>
      </section>
    </main>
  );
}
