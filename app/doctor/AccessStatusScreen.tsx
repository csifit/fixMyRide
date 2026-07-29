"use client";

import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import Link from "next/link";
import { logoutAction } from "./actions";

export default function AccessStatusScreen({
  status,
}: {
  status: "pending" | "suspended" | "unauthorized" | "configuration";
}) {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  const key = status === "configuration" ? "configuration" : status;

  return (
    <main className={`auth-shell ${ready ? "" : "i18n-pending"}`}>
      <section className="auth-card status-card">
        <header>
          <Link className="auth-brand" href="/"><span>+</span>VitaPass</Link>
          <label className="language">
            <span aria-hidden="true">◎</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label={t("a11y.languageSelector")}>
              <option value="en">{t("language.en")}</option><option value="de">{t("language.de")}</option><option value="ro">{t("language.ro")}</option><option value="hu">{t("language.hu")}</option>
            </select>
          </label>
        </header>
        <span className="auth-status-icon">⚕</span>
        <h1>{t(`auth.${key}.title` as TranslationKey)}</h1>
        <p>{t(`auth.${key}.description` as TranslationKey)}</p>
        {status !== "configuration" && <form action={logoutAction}><button type="submit">{t("auth.logout")}</button></form>}
        <Link className="auth-return" href="/">{t("auth.returnPatient")}</Link>
      </section>
    </main>
  );
}
