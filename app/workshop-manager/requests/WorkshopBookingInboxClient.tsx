"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { formatDateTime, translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { ManagedWorkshopBooking } from "@/lib/dal/workshop-bookings";
import { manageWorkshopBookingAction, type WorkshopBookingActionState } from "./actions";

type ActionKind = "confirm" | "propose_time" | "reschedule" | "decline" | "cancel";
type Translate = (key: TranslationKey) => string;
const idle: WorkshopBookingActionState = { status: "idle" };

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
    {needsStart && <label>{t("workshopBookings.action.time")}<input type="datetime-local" value={localStart} onChange={(event) => setLocalStart(event.target.value)} required /></label>}
    <label>{t(needsReason ? "workshopBookings.action.reason" : "workshopBookings.action.note")}<textarea name="note" rows={2} maxLength={1000} required={needsReason} /></label>
    {state.status !== "idle" && <p className={["confirmed", "proposed", "rescheduled", "declined", "cancelled"].includes(state.status) ? "note-success" : "note-error"} role="status">{t(`workshopBookings.result.${state.status}` as TranslationKey)}</p>}
    <button disabled={pending}>{t(pending ? "workshopBookings.action.saving" : `workshopBookings.action.${kind}` as TranslationKey)}</button>
  </form>;
}

function DateValue({ value, language }: { value: string | null; language: Language }) {
  return value ? <time dateTime={value}>{formatDateTime(language, value)}</time> : <span>—</span>;
}

function BookingCard({ booking, language, t }: { booking: ManagedWorkshopBooking; language: Language; t: Translate }) {
  const requested = booking.status === "requested";
  const confirmed = booking.status === "confirmed";
  return <details className={`booking-inbox-card status-${booking.status}`} open={requested}>
    <summary>
      <span><b>{booking.vehicleRegistration}</b><strong>{booking.vehicleMake} {booking.vehicleModel}</strong><small>{booking.serviceName} · {booking.workshopName}</small></span>
      <span><small>{t("workshopBookings.preferred")}</small><DateValue value={booking.preferredStart} language={language} /></span>
      <em>{t(`workshopBookings.status.${booking.status}` as TranslationKey)}</em>
    </summary>
    <div className="booking-inbox-detail">
      <section className="booking-inbox-facts">
        <h3>{t("workshopBookings.customerVehicle")}</h3>
        <dl>
          <div><dt>{t("workshopBookings.customer")}</dt><dd>{booking.customerName}</dd></div>
          <div><dt>{t("workshopBookings.contact")}</dt><dd><a href={`tel:${booking.customerPhone}`}>{booking.customerPhone}</a><br /><a href={`mailto:${booking.customerEmail}`}>{booking.customerEmail}</a></dd></div>
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
        <h3>{t("workshopBookings.notes")}</h3>
        <p>{booking.customerNote || t("workshopBookings.noCustomerNote")}</p>
        {booking.workshopNote && <p className="workshop-note"><b>{t("workshopBookings.workshopNote")}</b>{booking.workshopNote}</p>}
      </section>
      <section className="booking-inbox-actions">
        <h3>{t("workshopBookings.manage")}</h3>
        {requested && <><ActionForm bookingId={booking.id} kind="confirm" t={t} /><ActionForm bookingId={booking.id} kind="propose_time" t={t} /><ActionForm bookingId={booking.id} kind="decline" t={t} /></>}
        {confirmed && <><ActionForm bookingId={booking.id} kind="reschedule" t={t} /><ActionForm bookingId={booking.id} kind="propose_time" t={t} /><ActionForm bookingId={booking.id} kind="cancel" t={t} /></>}
        {!requested && !confirmed && <p>{t("workshopBookings.noActions")}</p>}
      </section>
      <section className="booking-inbox-history">
        <h3>{t("workshopBookings.history")}</h3>
        {booking.history.map((item, index) => <article key={`${item.createdAt}-${index}`}><span><b>{t(`workshopBookings.history.${item.action}` as TranslationKey)}</b><time>{formatDateTime(language, item.createdAt)}</time></span>{item.note && <p>{item.note}</p>}</article>)}
      </section>
    </div>
  </details>;
}

export default function WorkshopBookingInboxClient({ bookings, logoutAction }: { bookings: ManagedWorkshopBooking[]; logoutAction: () => Promise<void> }) {
  const [language, setLanguage, ready] = useLanguage();
  const [filter, setFilter] = useState("open");
  const t = (key: TranslationKey) => translate(language, key);
  const visible = useMemo(() => bookings.filter((booking) => filter === "all" || (filter === "open" ? ["requested", "confirmed"].includes(booking.status) : booking.status === filter)), [bookings, filter]);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  return <main className="settings-shell booking-inbox-shell">
    <header className="settings-topbar"><Link href="/clinic-manager">← {t("workspace.back")}</Link><strong>fixMyRide</strong><select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("a11y.languageSelector")}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select><form action={logoutAction}><button>{t("auth.logout")}</button></form></header>
    <section className="settings-content booking-inbox-content">
      <p className="registration-kicker">{t("workshopBookings.eyebrow")}</p><h1>{t("workshopBookings.title")}</h1><p>{t("workshopBookings.description")}</p>
      <div className="booking-inbox-toolbar"><strong>{visible.length} {t("workshopBookings.visible")}</strong><label>{t("workshopBookings.filter")}<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="open">{t("workshopBookings.filter.open")}</option><option value="requested">{t("workshopBookings.status.requested")}</option><option value="confirmed">{t("workshopBookings.status.confirmed")}</option><option value="declined">{t("workshopBookings.status.declined")}</option><option value="cancelled">{t("workshopBookings.status.cancelled")}</option><option value="all">{t("workshopBookings.filter.all")}</option></select></label></div>
      <div className="booking-inbox-list">{visible.map((booking) => <BookingCard key={booking.id} booking={booking} language={language} t={t} />)}{!visible.length && <div className="catalogue-empty"><h2>{t("workshopBookings.emptyTitle")}</h2><p>{t("workshopBookings.emptyDescription")}</p></div>}</div>
    </section>
  </main>;
}
