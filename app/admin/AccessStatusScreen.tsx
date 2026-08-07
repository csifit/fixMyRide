"use client";

import Link from "next/link";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { adminLogoutAction } from "./actions";
import PendingSubmitButton from "@/app/PendingSubmitButton";

export default function AdminAccessStatusScreen({
  status,
}: {
  status:
    | "configuration"
    | "unauthorized"
    | "suspended"
    | "unavailable"
    | "securityError";
}) {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);

  return (
    <main className={`auth-shell ${ready ? "" : "i18n-pending"}`}>
      <section className="auth-card status-card">
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
        <span className="auth-status-icon">⌾</span>
        <h1>{t(`admin.access.${status}.title` as TranslationKey)}</h1>
        <p>{t(`admin.access.${status}.description` as TranslationKey)}</p>
        {(status === "unavailable" || status === "securityError") && (
          <button type="button" onClick={() => window.location.reload()}>
            {t("common.retry")}
          </button>
        )}
        {status !== "configuration" && (
          <form action={adminLogoutAction}>
            <PendingSubmitButton type="submit">
              {t("auth.logout")}
            </PendingSubmitButton>
          </form>
        )}
        <Link className="auth-return" href="/">
          {t("admin.returnHome")}
        </Link>
      </section>
    </main>
  );
}
