"use client";

import Link from "next/link";
import { useActionState } from "react";
import PublicSiteHeader from "@/app/PublicSiteHeader";
import { formatDateTime, locales, translate, type Language, type TranslationKey } from "@/app/i18n";
import type { GuestBookingAccess } from "@/lib/dal/booking-access";
import { decideGuestEstimateAction, manageGuestBookingAction, setGuestWhatsAppPreferenceAction, type GuestBookingActionState } from "./actions";

const idle: GuestBookingActionState = { status: "idle" };

function ActionForm({ kind, language }: { kind: "accept_proposal" | "decline_proposal" | "cancel"; language: Language }) {
  const [state, action, pending] = useActionState(manageGuestBookingAction, idle);
  const t = (key: TranslationKey) => translate(language, key);
  const needsNote = kind !== "accept_proposal";
  return <form className={`booking-access-action ${kind === "cancel" ? "danger" : ""}`} action={action}>
    <input type="hidden" name="action" value={kind} />
    {needsNote ? <label>{t(kind === "cancel" ? "phase7.access.cancelReason" : "phase7.access.noteOptional")}<textarea name="note" rows={2} maxLength={2000} required={kind === "cancel"} /></label> : <input type="hidden" name="note" value="" />}
    {state.status !== "idle" && <p role="status">{t(`phase7.access.result.${state.status}` as TranslationKey)}</p>}
    <button disabled={pending}>{t(`phase7.access.${kind}` as TranslationKey)}</button>
  </form>;
}

function EstimateAction({ estimateId, decision, language }: { estimateId: string; decision: "approve" | "decline"; language: Language }) {
  const [state, action, pending] = useActionState(decideGuestEstimateAction, idle);
  const t = (key: TranslationKey) => translate(language, key);
  return <form className="booking-access-action" action={action}>
    <input type="hidden" name="estimateId" value={estimateId} /><input type="hidden" name="decision" value={decision} />
    <label>{t("phase7.access.noteOptional")}<textarea name="note" rows={2} maxLength={2000} /></label>
    {state.status !== "idle" && <p role="status">{t(`phase7.access.result.${state.status}` as TranslationKey)}</p>}
    <button disabled={pending}>{t(`phase7.access.estimate.${decision}` as TranslationKey)}</button>
  </form>;
}

function GuestWhatsAppPanel({ booking, language }: { booking: GuestBookingAccess; language: Language }) {
  const [state, action, pending] = useActionState(setGuestWhatsAppPreferenceAction, idle);
  const t = (key: TranslationKey) => translate(language, key);
  const businessNumber = process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER?.replace(/\D/g, "") || "";
  return <section className="booking-whatsapp-panel customer-whatsapp-panel"><header><div><p>{t("phase8.thread.eyebrow")}</p><h2>{t("phase8.thread.title")}</h2></div><span className={booking.whatsapp.optedIn ? "active" : "inactive"}>{t(booking.whatsapp.optedIn ? "phase8.status.active" : "phase8.status.inactive")}</span></header><p>{t(booking.whatsapp.optedIn ? "phase8.customer.activeHelp" : "phase8.customer.inactiveHelp")}</p>{booking.whatsapp.messages.length > 0 && <div className="booking-whatsapp-thread">{booking.whatsapp.messages.map((message, index) => <article className={message.direction} key={`${message.occurredAt}-${index}`}><p>{message.body}</p><small>{formatDateTime(language, message.occurredAt)}{message.providerStatus ? ` · ${t(`phase8.delivery.${message.providerStatus}` as TranslationKey)}` : ""}</small></article>)}</div>}<form action={action}><input type="hidden" name="enabled" value={booking.whatsapp.optedIn ? "false" : "true"} />{state.status !== "idle" && <p role="status">{t(`phase8.preference.${state.status}` as TranslationKey)}</p>}<button disabled={pending}>{t(booking.whatsapp.optedIn ? "phase8.preference.disable" : "phase8.preference.enable")}</button></form>{booking.whatsapp.optedIn && businessNumber && <a href={`https://wa.me/${businessNumber}?text=${encodeURIComponent(`Pitster booking ${booking.id}`)}`} target="_blank" rel="noreferrer">{t("phase8.customer.openWhatsApp")}</a>}<small>{t("phase8.optOut.help")}</small></section>;
}

export default function BookingAccessClient({ booking }: { booking: GuestBookingAccess }) {
  const language = booking.locale as Language;
  const t = (key: TranslationKey) => translate(language, key);
  const proposalOpen = Boolean(booking.proposedStart) && ["requested", "confirmed"].includes(booking.status);
  return <main className="booking-shell booking-access-shell">
    <PublicSiteHeader />
    <section className="booking-access-page">
      <header><div><p>{t("phase7.access.eyebrow")}</p><h1>{booking.serviceName}</h1><span>{booking.workshopName} · {booking.vehicleRegistration}</span></div><em>{t(`workshopBookings.status.${booking.status}` as TranslationKey)}</em></header>
      <section className="booking-access-summary"><h2>{t("phase7.access.appointment")}</h2><dl><div><dt>{t("customerBookings.preferred")}</dt><dd>{formatDateTime(language, booking.preferredStart)}</dd></div>{booking.confirmedStart && <div><dt>{t("customerBookings.confirmed")}</dt><dd>{formatDateTime(language, booking.confirmedStart)}</dd></div>}<div><dt>{t("customerBookings.vehicle")}</dt><dd>{booking.vehicleMake} {booking.vehicleModel}{booking.vehicleYear ? ` (${booking.vehicleYear})` : ""}</dd></div></dl>{booking.customerNote && <p>{booking.customerNote}</p>}{booking.workshopMessage && <p>{booking.workshopMessage}</p>}</section>
      {proposalOpen && <section className="booking-access-decision"><p>{t("phase7.access.proposal")}</p><h2>{booking.proposedStart ? formatDateTime(language, booking.proposedStart) : ""}</h2>{booking.proposalNote && <p>{booking.proposalNote}</p>}<div><ActionForm kind="accept_proposal" language={language} /><ActionForm kind="decline_proposal" language={language} /></div></section>}
      {booking.estimate && <section className="booking-access-estimate"><header><div><p>{t("repairLifecycle.estimate")} #{booking.estimate.version}</p><h2>{new Intl.NumberFormat(locales[language], { style: "currency", currency: booking.estimate.currency }).format(booking.estimate.totalCents / 100)}</h2></div><em>{t(`repairLifecycle.estimateStatus.${booking.estimate.status}` as TranslationKey)}</em></header><p>{booking.estimate.diagnosisSummary}</p><table><tbody>{booking.estimate.items.map((item, index) => <tr key={index}><td>{item.description}</td><td>{item.quantity} × {new Intl.NumberFormat(locales[language], { style: "currency", currency: booking.estimate!.currency }).format(item.unitPriceCents / 100)}</td></tr>)}</tbody></table>{booking.estimate.customerNote && <p>{booking.estimate.customerNote}</p>}{booking.estimate.status === "awaiting_customer" && <div className="booking-access-estimate-actions"><EstimateAction estimateId={booking.estimate.id} decision="approve" language={language} /><EstimateAction estimateId={booking.estimate.id} decision="decline" language={language} /></div>}</section>}
      <GuestWhatsAppPanel booking={booking} language={language} />
      <details className="booking-access-history"><summary>{t("customerBookings.history")}</summary>{booking.history.map((item, index) => <article key={`${item.createdAt}-${index}`}><span>{t(`workshopBookings.history.${item.action}` as TranslationKey)} · {formatDateTime(language, item.createdAt)}</span>{item.note && <p>{item.note}</p>}</article>)}</details>
      {booking.canCancel && <details className="booking-access-cancel"><summary>{t("customerBookings.cancelTitle")}</summary><ActionForm kind="cancel" language={language} /></details>}
      <footer><p>{t("phase7.access.privateLink")}</p>{booking.workshopPhone && <a href={`tel:${booking.workshopPhone}`}>{booking.workshopPhone}</a>}{booking.workshopEmail && <a href={`mailto:${booking.workshopEmail}`}>{booking.workshopEmail}</a>}<Link href="/customer/login">{t("phase7.access.signIn")}</Link></footer>
    </section>
  </main>;
}
