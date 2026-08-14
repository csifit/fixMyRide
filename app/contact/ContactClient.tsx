"use client";

import Link from "next/link";
import { useActionState } from "react";
import PublicSiteHeader from "@/app/PublicSiteHeader";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { brand } from "@/lib/brand";
import { createContactTicketAction, type ContactTicketState } from "./actions";

const initialState: ContactTicketState = { status: "idle" };

export default function ContactClient({ initialType }: { initialType: "support" | "problem" | "account_closure" }) {
  const [language] = useLanguage();
  const [state, action, pending] = useActionState(createContactTicketAction, initialState);
  const t = (key: TranslationKey) => translate(language, key);

  return <main className="contact-shell">
    <PublicSiteHeader />
    <section className="contact-hero">
      <p>{t("contact.kicker")}</p>
      <h1>{t(initialType === "problem" ? "contact.problemTitle" : initialType === "account_closure" ? "contact.accountClosureTitle" : "contact.supportTitle")}</h1>
      <span>{t("contact.description")}</span>
    </section>
    <section className="contact-layout">
      <aside className="contact-process">
        <p>{t("contact.processTitle")}</p>
        <ol>
          <li><span>01</span><div>{t("contact.process.create")}</div></li>
          <li><span>02</span><div>{t("contact.process.review")}</div></li>
          <li><span>03</span><div>{t("contact.process.reply")}</div></li>
        </ol>
        <p className="contact-process-note">{t("contact.process.note")}</p>
      </aside>
      <section className="contact-ticket-card">
        {state.status === "created" ? <div className="contact-ticket-success" role="status">
          <span aria-hidden="true">✓</span>
          <h2>{t("contact.successTitle")}</h2>
          <p>{t("contact.successDescription")}</p>
          <code>{state.reference}</code>
          <p>{t("contact.referenceNote")}</p>
          <Link href={`/contact?type=${initialType === "account_closure" ? "account-closure" : initialType}`}>{t("contact.createAnother")}</Link>
        </div> : <>
          <header>
            <p>{t("contact.formKicker")}</p>
            <h2>{t("contact.formTitle")}</h2>
            <span>{t("contact.requiredNote")}</span>
          </header>
          <form action={action} className="contact-ticket-form">
            <div className="contact-field-pair">
              <label>{t("contact.ticketType")}<select name="ticketType" defaultValue={initialType}>
                <option value="support">{t("contact.type.support")}</option>
                <option value="problem">{t("contact.type.problem")}</option>
                <option value="account_closure">{t("contact.type.accountClosure")}</option>
              </select></label>
              <label>{t("contact.requesterType")}<select name="requesterType" defaultValue="customer">
                <option value="customer">{t("contact.requester.customer")}</option>
                <option value="service_organisation">{t("contact.requester.organisation")}</option>
                <option value="workshop_manager">{t("contact.requester.manager")}</option>
                <option value="other">{t("contact.requester.other")}</option>
              </select></label>
            </div>
            <div className="contact-field-pair">
              <label>{t("contact.name")}<input name="requesterName" minLength={2} maxLength={120} autoComplete="name" required /></label>
              <label>{t("contact.email")}<input name="requesterEmail" type="email" maxLength={254} autoComplete="email" required /></label>
            </div>
            {initialType === "account_closure" && <p className="contact-account-closure-note">{t("contact.accountClosureNote")}</p>}
            <label>{t("contact.subject")}<input name="subject" minLength={4} maxLength={160} required /></label>
            <label>{t("contact.descriptionLabel")}<textarea name="description" minLength={20} maxLength={5000} rows={8} required placeholder={t("contact.descriptionPlaceholder")} /></label>
            <label>{t("contact.pageUrl")}<input name="pageUrl" type="url" maxLength={1000} placeholder="https://www.pitster.app/..." /></label>
            <label className="contact-honeypot" aria-hidden="true">Website<input name="companyWebsite" tabIndex={-1} autoComplete="off" /></label>
            {state.status !== "idle" && <p className="contact-form-message" role="alert">{t(`contact.status.${state.status}` as TranslationKey)}</p>}
            <div className="contact-submit-row"><p>{t("contact.privacyNote")}</p><button disabled={pending}>{t(pending ? "contact.submitting" : "contact.submit")}</button></div>
          </form>
        </>}
      </section>
    </section>
    <footer className="contact-footer"><span>© {new Date().getFullYear()} {brand.name}</span><Link href="/faq">{t("contact.readFaq")}</Link></footer>
  </main>;
}
