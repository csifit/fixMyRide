"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { BillingProfile } from "@/lib/dal/invoicing";
import {
  updateBillingAction,
  type BillingMutationState,
} from "./invoicing-actions";

const initialState: BillingMutationState = { status: "idle" };

export default function InvoicingDetailsClient({
  profile,
  clinicId,
  backHref,
  logoutAction,
}: {
  profile: BillingProfile;
  clinicId: string | null;
  backHref: string;
  logoutAction: () => Promise<void>;
}) {
  const [language, setLanguage, ready] = useLanguage();
  const [state, action, pending] = useActionState(updateBillingAction, initialState);
  const inFlight = useRef(false);
  const t = (key: TranslationKey) => translate(language, key);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  return (
    <main className="registration-shell">
      <section className="registration-card">
        <header className="registration-header"><Link href={backHref}>← {t("invoicing.back")}</Link><select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label={t("a11y.languageSelector")}><option value="en">{t("language.en")}</option><option value="de">{t("language.de")}</option><option value="ro">{t("language.ro")}</option><option value="hu">{t("language.hu")}</option></select><form className="registration-logout" action={logoutAction}><button>{t("auth.logout")}</button></form></header>
        <p className="registration-kicker">{t("invoicing.eyebrow")}</p>
        <h1>{t("invoicing.title")}</h1>
        <p>{t("invoicing.description")}</p>
        <form action={action} onSubmit={(event) => { if (pending || inFlight.current) event.preventDefault(); else inFlight.current = true; }}>
          <input type="hidden" name="clinicId" value={clinicId ?? ""} />
          <label>{t("invoicing.legalName")}<input name="legalName" defaultValue={profile.legalName ?? ""} /></label>
          <label>{t("invoicing.fiscalIdentifier")}<input name="fiscalIdentifier" defaultValue={profile.fiscalIdentifier ?? ""} /></label>
          <label>{t("invoicing.vatIdentifier")}<input name="vatIdentifier" defaultValue={profile.vatIdentifier ?? ""} /></label>
          <label>{t("invoicing.tradeRegister")}<input name="tradeRegisterNumber" defaultValue={profile.tradeRegisterNumber ?? ""} /></label>
          <label>{t("invoicing.address")}<input name="billingAddress" defaultValue={profile.billingAddress ?? ""} /></label>
          <label>{t("invoicing.country")}<input name="billingCountry" defaultValue={profile.billingCountry ?? "RO"} maxLength={2} /></label>
          <label>{t("invoicing.email")}<input name="billingEmail" type="email" defaultValue={profile.billingEmail ?? ""} /></label>
          <label>{t("invoicing.contact")}<input name="billingContact" defaultValue={profile.billingContact ?? ""} /></label>
          {state.status !== "idle" && <p className={state.status === "saved" ? "note-success" : "note-error"} role="status">{t(`invoicing.status.${state.status}` as TranslationKey)}</p>}
          <button disabled={pending}>{t(pending ? "invoicing.saving" : "invoicing.save")}</button>
        </form>
      </section>
    </main>
  );
}
