"use client";

import Link from "next/link";
import { translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { brand } from "@/lib/brand";
import PublicProviderMenu from "@/app/PublicProviderMenu";

export default function PublicSiteHeader() {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  return <header className="booking-header">
    <Link href="/" className="booking-logo"><span>{brand.mark}</span>{brand.name}</Link>
    <nav>
      <Link href="/workshops">{t("home.nav.findWorkshop")}</Link>
      <Link href="/customer/login">{t("home.nav.garage")}</Link>
      <PublicProviderMenu labels={{
        menu: t("home.nav.providers"),
        serviceOrganisation: t("home.nav.serviceOrganisationAccess"),
        workshop: t("home.nav.workshopLogin"),
        signIn: t("home.nav.signIn"),
        register: t("home.nav.register"),
        invitationOnly: t("home.nav.invitationOnly"),
      }} />
    </nav>
    <select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={ready ? t("a11y.languageSelector") : "Language"}>
      <option value="en">EN</option><option value="de">DE</option>
      <option value="ro">RO</option><option value="hu">HU</option>
    </select>
  </header>;
}
