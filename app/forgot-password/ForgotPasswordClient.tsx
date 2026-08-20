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
import {
  requestPasswordResetAction,
  type ForgotPasswordState,
} from "./actions";

const initialState: ForgotPasswordState = { status: "idle" };

export default function ForgotPasswordClient({
  configured,
  portal,
}: {
  configured: boolean;
  portal: RecoveryPortal;
}) {
  const [language, setLanguage, ready] = useLanguage();
  const [state, action, pending] = useActionState(
    requestPasswordResetAction,
    initialState,
  );
  const t = (key: TranslationKey) => translate(language, key);
  const loginPath = recoveryLoginPaths[portal];

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
          <span>↗</span>
          <h1>{t("passwordRecovery.request.title")}</h1>
          <p>{t("passwordRecovery.request.description")}</p>
        </div>

        {!configured ? (
          <p className="auth-error" role="alert">
            {t("auth.configuration.description")}
          </p>
        ) : state.status === "sent" ? (
          <div className="auth-message recovery-success" role="status">
            <strong>{t("passwordRecovery.request.sentTitle")}</strong>
            <p>{t("passwordRecovery.request.sentDescription")}</p>
          </div>
        ) : (
          <form action={action}>
            <input type="hidden" name="portal" value={portal} />
            <label>
              {t("passwordRecovery.email")}
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
              />
            </label>
            {state.status !== "idle" && (
              <p className="auth-error" role="alert">
                {t(`passwordRecovery.status.${state.status}` as TranslationKey)}
              </p>
            )}
            <button disabled={pending}>
              {t(pending
                ? "passwordRecovery.request.submitting"
                : "passwordRecovery.request.submit")}
            </button>
          </form>
        )}
        <Link className="auth-return recovery-return" href={loginPath}>
          {t("passwordRecovery.backToLogin")}
        </Link>
      </section>
    </main>
  );
}
