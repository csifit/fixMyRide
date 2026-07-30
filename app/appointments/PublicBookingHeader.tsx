"use client";

import Link from "next/link";
import { translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";

export default function PublicBookingHeader() {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  return <header className="booking-header">
    <Link href="/" className="booking-logo"><span>+</span>VitaPass</Link>
    <nav>
      <Link href="/appointments">{ready ? t("booking.findDoctor") : "Find a doctor"}</Link>
      <Link href="/register/patient">{ready ? t("booking.createAccount") : "Create account"}</Link>
      <Link href="/doctor/login">{ready ? t("booking.forProfessionals") : "For professionals"}</Link>
    </nav>
    <select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={ready ? t("a11y.languageSelector") : "Language"}>
      <option value="en">EN</option><option value="de">DE</option>
      <option value="ro">RO</option><option value="hu">HU</option>
    </select>
  </header>;
}
