"use client";

import Link from "@/app/WorkspaceLink";
import { useActionState, useMemo, useState } from "react";
import { formatDateTime, translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { ManagedWorkshopBooking } from "@/lib/dal/workshop-bookings";
import type { ManagedWorkshopCatalogue } from "@/lib/dal/workshop-services";
import type { BookingResource, WorkshopSchedule } from "@/lib/dal/workshop-scheduling";
import type { WorkshopOperations } from "@/lib/dal/workshop-operations";
import { manageWorkshopBookingAction, markWorkshopBookingReadAction, sendWorkshopWhatsAppReplyAction, type WhatsAppReplyState, type WorkshopBookingActionState } from "./actions";
import WorkshopBookingCalendar from "./WorkshopBookingCalendar";
import PlatformDateTimeInput from "@/app/PlatformDateTimeInput";
import { FieldHelp, OperationalEmptyState, OperationalIntroduction } from "@/app/guidance/OperationalGuidance";

type ActionKind = "confirm" | "propose_time" | "reschedule" | "decline" | "cancel";
type Translate = (key: TranslationKey) => string;
const idle: WorkshopBookingActionState = { status: "idle" };
const whatsappIdle: WhatsAppReplyState = { status: "idle" };

function ActionForm({ bookingId, kind, t }: { bookingId: string; kind: ActionKind; t: Translate }) {
  const [state, action, pending] = useActionState(manageWorkshopBookingAction, idle);
  const [localStart, setLocalStart] = useState("");
  const needsStart = ["confirm", "propose_time", "reschedule"].includes(kind);
  const needsReason = ["decline", "cancel"].includes(kind);
  const isoStart = localStart ? new Date(localStart).toISOString() : "";
  return <form className={`booking-action-form ${needsReason ? "danger" : ""}`} action={action}>
    <input type="hidden" name="bookingId" value={bookingId} />
    <input type="hidden" name="action" value={kind} />
    <input type="hidden" name="requestedStart" value={isoStart} />
    {needsStart && <label>{t("workshopBookings.action.time")}<PlatformDateTimeInput mode="datetime-local" value={localStart} onChange={setLocalStart} required ariaLabel={t("workshopBookings.action.time")} /><FieldHelp>{t("phase3.requests.actionTimeHelp")}</FieldHelp></label>}
    <label>{t(needsReason ? "workshopBookings.action.reason" : "phase7.messaging.customerMessage")}<textarea name="note" rows={2} maxLength={1000} required={needsReason} /><FieldHelp>{t(needsReason ? "phase3.requests.reasonHelp" : "phase7.messaging.customerVisibleHelp")}</FieldHelp></label>
    {state.status !== "idle" && <p className={["confirmed", "proposed", "rescheduled", "declined", "cancelled"].includes(state.status) ? "note-success" : "note-error"} role="status">{t(`workshopBookings.result.${state.status}` as TranslationKey)}</p>}
    <button disabled={pending}>{t(pending ? "workshopBookings.action.saving" : `workshopBookings.action.${kind}` as TranslationKey)}</button>
  </form>;
}

function DateValue({ value, language }: { value: string | null; language: Language }) {
  return value ? <time dateTime={value}>{formatDateTime(language, value)}</time> : <span>—</span>;
}

function WorkshopWhatsAppPanel({ booking, language, t }: { booking: ManagedWorkshopBooking; language: Language; t: Translate }) {
  const [state, action, pending] = useActionState(sendWorkshopWhatsAppReplyAction, whatsappIdle);
  const replyOpen = booking.whatsapp.optedIn && booking.whatsapp.replyWindowOpen;
  return <section className="booking-whatsapp-panel workshop-whatsapp-panel">
    <header><div><p>{t("phase8.thread.eyebrow")}</p><h3>{t("phase8.thread.title")}</h3></div><span className={replyOpen ? "active" : "inactive"}>{t(replyOpen ? "phase8.window.open" : "phase8.window.closed")}</span></header>
    {!booking.whatsapp.optedIn && <p>{t("phase8.workshop.noConsent")}</p>}
    {booking.whatsapp.optedIn && !replyOpen && <p>{t("phase8.workshop.closedHelp")}</p>}
    {booking.whatsapp.messages.length > 0 && <div className="booking-whatsapp-thread">{booking.whatsapp.messages.map((message, index) => <article className={message.direction} key={`${message.occurredAt}-${index}`}><p>{message.body}</p><small>{formatDateTime(language, message.occurredAt)}{message.providerStatus ? ` · ${t(`phase8.delivery.${message.providerStatus}` as TranslationKey)}` : ""}</small></article>)}</div>}
    {replyOpen && <form action={action}><input type="hidden" name="bookingId" value={booking.id} /><label>{t("phase8.workshop.replyLabel")}<textarea name="message" minLength={1} maxLength={4096} rows={3} required /><FieldHelp>{t("phase8.workshop.replyHelp")}</FieldHelp></label>{state.status !== "idle" && <p role="status">{t(`phase8.reply.${state.status}` as TranslationKey)}</p>}<button disabled={pending}>{t(pending ? "phase8.reply.sending" : "phase8.reply.send")}</button></form>}
  </section>;
}

function BookingCard({ booking, language, t }: { booking: ManagedWorkshopBooking; language: Language; t: Translate }) {
  const requested = booking.status === "requested";
  const confirmed = booking.status === "confirmed";
  return <details className={`booking-inbox-card status-${booking.status}`} open={requested}>
    <summary>
      <span><b>{booking.vehicleRegistration}</b><strong>{booking.vehicleMake} {booking.vehicleModel}</strong><small>{booking.serviceName} · {booking.workshopName}</small></span>
      <span><small>{t("workshopBookings.preferred")}</small><DateValue value={booking.preferredStart} language={language} /></span>
      {booking.unreadCommunicationCount > 0 && <span className="booking-unread-badge">{booking.unreadCommunicationCount} {t("phase7.messaging.newUpdates")}</span>}
      <em>{t(`workshopBookings.status.${booking.status}` as TranslationKey)}</em>
    </summary>
    <div className="booking-inbox-detail">
      <section className="booking-inbox-facts">
        <h3>{t("workshopBookings.customerVehicle")}</h3>
        <dl>
          <div><dt>{t("workshopBookings.customer")}</dt><dd>{booking.customerName}</dd></div>
          <div><dt>{t("workshopBookings.contact")}</dt><dd>{booking.customerPhone ? <a href={`tel:${booking.customerPhone}`}>{booking.customerPhone}</a> : "—"}<br />{booking.customerEmail ? <a href={`mailto:${booking.customerEmail}`}>{booking.customerEmail}</a> : "—"}</dd></div>
          <div><dt>{t("workshopBookings.vehicle")}</dt><dd>{booking.vehicleMake} {booking.vehicleModel}{booking.vehicleYear ? ` (${booking.vehicleYear})` : ""}<br />{booking.vehicleRegistration}</dd></div>
          <div><dt>{t("workshopBookings.mileage")}</dt><dd>{booking.mileageKm === null ? "—" : `${booking.mileageKm.toLocaleString()} km`}</dd></div>
          <div><dt>{t("workshopBookings.mobility")}</dt><dd>{booking.mobilityRequirement ? t(`workshopBookings.mobility.${booking.mobilityRequirement}` as TranslationKey) : "—"}</dd></div>
          <div><dt>{t("workshopBookings.language")}</dt><dd>{booking.locale.toUpperCase()}</dd></div>
        </dl>
        <h3>{t("workshopBookings.requestedTimes")}</h3>
        <dl>
          <div><dt>{t("workshopBookings.preferred")}</dt><dd><DateValue value={booking.preferredStart} language={language} /></dd></div>
          <div><dt>{t("workshopBookings.alternate")}</dt><dd><DateValue value={booking.alternateStart} language={language} /></dd></div>
          <div><dt>{t("workshopBookings.confirmed")}</dt><dd><DateValue value={booking.confirmedStart} language={language} /></dd></div>
          <div><dt>{t("workshopBookings.proposed")}</dt><dd><DateValue value={booking.proposedStart} language={language} />{booking.proposalNote && <small>{booking.proposalNote}</small>}</dd></div>
        </dl>
        <h3>{t("workshopBookings.customerStates")}</h3>
        <p>{booking.customerNote || t("workshopBookings.noCustomerNote")}</p>
        {booking.workshopNote && <p className="workshop-note"><b>{t("workshopBookings.workshopNote")}</b>{booking.workshopNote}</p>}
      </section>
      <section className="booking-inbox-actions">
        <h3>{t("workshopBookings.manage")}</h3>
        {requested && <><ActionForm bookingId={booking.id} kind="confirm" t={t} /><ActionForm bookingId={booking.id} kind="propose_time" t={t} /><ActionForm bookingId={booking.id} kind="decline" t={t} /></>}
        {confirmed && <><ActionForm bookingId={booking.id} kind="reschedule" t={t} /><ActionForm bookingId={booking.id} kind="propose_time" t={t} /><ActionForm bookingId={booking.id} kind="cancel" t={t} /></>}
        {!requested && !confirmed && <p>{t("workshopBookings.noActions")}</p>}
      </section>
      <WorkshopWhatsAppPanel booking={booking} language={language} t={t} />
      <section className="booking-inbox-history">
        <h3>{t("workshopBookings.history")}</h3>{booking.unreadCommunicationCount > 0 && <form action={markWorkshopBookingReadAction}><input type="hidden" name="bookingId" value={booking.id} /><button className="booking-mark-read">{t("phase7.messaging.markRead")}</button></form>}
        {booking.history.map((item, index) => <article key={`${item.createdAt}-${index}`}><span><b>{t(`workshopBookings.history.${item.action}` as TranslationKey)}</b><time>{formatDateTime(language, item.createdAt)}</time></span>{item.note && <p>{item.note}</p>}</article>)}
      </section>
    </div>
  </details>;
}

export default function WorkshopBookingInboxClient({ bookings, catalogues, schedules, assignments, operations, logoutAction }: { bookings: ManagedWorkshopBooking[]; catalogues: ManagedWorkshopCatalogue[]; schedules: WorkshopSchedule[]; assignments: Record<string, BookingResource[]>; operations: WorkshopOperations[]; logoutAction: () => Promise<void> }) {
  const [language, setLanguage, ready] = useLanguage();
  const [filter, setFilter] = useState("open");
  const t = (key: TranslationKey) => translate(language, key);
  const visible = useMemo(() => bookings.filter((booking) => filter === "all" || (filter === "open" ? ["requested", "confirmed"].includes(booking.status) : booking.status === filter)), [bookings, filter]);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  return <main className="settings-shell booking-inbox-shell">
    <header className="settings-topbar"><Link href="/workshop-manager">← {t("workspace.back")}</Link><strong>pitster</strong><select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("a11y.languageSelector")}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select><form action={logoutAction}><button>{t("auth.logout")}</button></form></header>
    <section className="settings-content booking-inbox-content">
      <p className="registration-kicker">{t("workshopBookings.eyebrow")}</p><h1>{t("workshopBookings.title")}</h1><p>{t("workshopBookings.description")}</p>
      <OperationalIntroduction title={t("operationalGuidance.howTitle")} description={t("phase3.requests.intro")} outcomeLabel={t("operationalGuidance.whyLabel")} outcome={t("phase3.requests.outcome")} stepsLabel={t("operationalGuidance.stepsLabel")} steps={[t("phase3.requests.step1"), t("phase3.requests.step2"), t("phase3.requests.step3")]} />
      <WorkshopBookingCalendar bookings={bookings} catalogues={catalogues} schedules={schedules} assignments={assignments} operations={operations} language={language} t={t} />
      <div className="booking-inbox-toolbar"><strong>{visible.length} {t("workshopBookings.visible")}</strong><label>{t("workshopBookings.filter")}<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="open">{t("workshopBookings.filter.open")}</option><option value="requested">{t("workshopBookings.status.requested")}</option><option value="confirmed">{t("workshopBookings.status.confirmed")}</option><option value="declined">{t("workshopBookings.status.declined")}</option><option value="cancelled">{t("workshopBookings.status.cancelled")}</option><option value="all">{t("workshopBookings.filter.all")}</option></select><FieldHelp>{t("phase3.requests.filterHelp")}</FieldHelp></label></div>
      <div className="booking-inbox-list">{visible.map((booking) => <BookingCard key={booking.id} booking={booking} language={language} t={t} />)}{!visible.length && <OperationalEmptyState mark="C" title={t("workshopBookings.emptyTitle")} description={bookings.length ? t("phase3.requests.filteredEmpty") : t("workshopBookings.emptyDescription")} action={bookings.length ? <button type="button" onClick={() => setFilter("all")}>{t("workshopBookings.filter.all")}</button> : <a href="#manual-appointment">+ {t("workshopBookings.manual.add")}</a>} />}</div>
    </section>
  </main>;
}
