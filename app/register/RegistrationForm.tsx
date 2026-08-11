"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { languages, translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { brand } from "@/lib/brand";
import {
  registerAction,
  type PublicRegistrationType,
  type RegistrationState,
} from "./actions";

const initialState: RegistrationState = { status: "idle" };

export default function RegistrationForm({
  accountType,
  initialEmail = "",
}: {
  accountType: PublicRegistrationType;
  initialEmail?: string;
}) {
  const [language, setLanguage, ready] = useLanguage();
  const [state, action, pending] = useActionState(registerAction, initialState);
  const inFlight = useRef(false);
  const t = (key: TranslationKey) => translate(language, key);

  useEffect(() => {
    if (!pending) inFlight.current = false;
  }, [pending, state]);

  function preventDuplicate(event: React.FormEvent<HTMLFormElement>) {
    if (pending || inFlight.current) {
      event.preventDefault();
      return;
    }
    inFlight.current = true;
  }

  if (!ready) return <main className="registration-shell" aria-busy="true" />;

  return (
    <main className="registration-shell">
      <section className="registration-card">
        <header className="registration-header">
          <Link href="/" className="registration-brand">{brand.name}</Link>
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
        <h1>{t(`register.${accountType}.title` as TranslationKey)}</h1>
        <p>{t(`register.${accountType}.description` as TranslationKey)}</p>

        <form action={action} onSubmit={preventDuplicate}>
          <input type="hidden" name="registrationType" value={accountType} />
          <label>{t("register.fullName")}<input name="fullName" required minLength={2} maxLength={160} autoComplete="name" /></label>
          <label>{t("register.email")}<input name="email" required type="email" autoComplete="email" defaultValue={initialEmail} /></label>

          {accountType === "workshop_manager" && <>
            <label>{t("register.workshop_manager.legalName")}<input name="serviceProviderLegalName" required minLength={2} maxLength={200} /></label>
            <label>{t("register.workshop_manager.displayName")}<input name="serviceProviderDisplayName" required minLength={2} maxLength={160} /></label>
            <label>{t("register.country")}<input name="serviceProviderCountry" required defaultValue="RO" pattern="[A-Za-z]{2}" maxLength={2} /></label>
          </>}

          {state.status !== "idle" && (
            <p className={state.status === "check_email" ? "note-success" : "note-error"} role="status">
              {t(`register.status.${state.status}` as TranslationKey)}
            </p>
          )}
          <button type="submit" disabled={pending || state.status === "check_email"}>
            {t(pending ? "register.submitting" : "register.submit")}
          </button>
        </form>
        <nav className="registration-links">
          <Link href="/register">{t("register.chooseAnother")}</Link>
          <Link href={accountType === "customer" ? "/customer/login" : "/service-organisation/login"}>{t("register.alreadyAccount")}</Link>
        </nav>
      </section>
    </main>
  );
}
