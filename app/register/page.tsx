"use client";

import Link from "next/link";
import { languages, translate } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";

export default function RegistrationChoicePage() {
  const [language, setLanguage, ready] = useLanguage();
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return (
    <main className="registration-shell">
      <section className="registration-card">
        <header className="registration-header">
          <Link href="/" className="registration-brand">VitaPass</Link>
          <select
            aria-label={t("a11y.languageSelector")}
            value={language}
            onChange={(event) => setLanguage(event.target.value as typeof language)}
          >
            {languages.map((item) => (
              <option value={item} key={item}>{t(`language.${item}`)}</option>
            ))}
          </select>
        </header>
        <p className="registration-kicker">{t("register.kicker")}</p>
        <h1>{t("register.choice.title")}</h1>
        <p>{t("register.choice.description")}</p>
        <div className="registration-choices">
          <Link href="/register/customer">{t("register.customer.choice")}</Link>
          <Link href="/register/workshop-manager">{t("register.workshop_manager.choice")}</Link>
        </div>
      </section>
    </main>
  );
}
