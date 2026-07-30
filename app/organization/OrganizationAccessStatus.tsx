"use client";

import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";

export default function OrganizationAccessStatus({
  kind,
  status,
}: {
  kind: "clinic_manager" | "staff";
  status: "configuration" | "unavailable" | "unauthorized" | "pending" | "suspended" | "rejected";
}) {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  return (
    <main className={`auth-shell ${ready ? "" : "i18n-pending"}`}>
      <section className="auth-card status-card">
        <header><strong>VitaPass</strong><select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label={t("a11y.languageSelector")}><option value="en">{t("language.en")}</option><option value="de">{t("language.de")}</option><option value="ro">{t("language.ro")}</option><option value="hu">{t("language.hu")}</option></select></header>
        <h1>{t(`organization.${kind}.eyebrow` as TranslationKey)}</h1>
        <p>{t(`organization.access.${status}` as TranslationKey)}</p>
      </section>
    </main>
  );
}

