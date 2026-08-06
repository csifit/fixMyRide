"use client";

import Link from "next/link";
import { translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { brand } from "@/lib/brand";

export default function PublicBookingHeader() {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  return <header className="booking-header">
    <Link href="/" className="booking-logo"><span>{brand.mark}</span>{brand.name}</Link>
    <nav>
      <Link href="/workshops">Find a workshop</Link>
      <Link href="/garage">My Garage</Link>
      <Link href="/workshop-manager/login">For service providers</Link>
    </nav>
    <select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={ready ? t("a11y.languageSelector") : "Language"}>
      <option value="en">EN</option><option value="de">DE</option>
      <option value="ro">RO</option><option value="hu">HU</option>
    </select>
  </header>;
}
