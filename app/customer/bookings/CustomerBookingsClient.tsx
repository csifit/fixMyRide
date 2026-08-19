"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { formatDateTime, locales, translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { CustomerBooking } from "@/lib/dal/customer-bookings";
import type { CustomerMaintenanceNotification } from "@/lib/dal/customer-maintenance";
import { decideRepairEstimateAction, dismissMaintenanceNotificationAction, manageCustomerBookingAction, submitServiceFeedbackAction, type CustomerBookingActionState } from "./actions";
import { CustomerDecisionGuide, CustomerHint, CustomerPageGuide } from "@/app/guidance/CustomerGuidance";

type Translate = (key: TranslationKey) => string;
const idle: CustomerBookingActionState = { status: "idle" };

function DateValue({ value, language }: { value: string | null; language: Language }) {
  return value ? <time dateTime={value}>{formatDateTime(language, value)}</time> : <span>—</span>;
}

function money(language: Language, cents: number, currency: string) {
  return new Intl.NumberFormat(locales[language], { style: "currency", currency }).format(cents / 100);
}

const lifecycleStages = [
  "customerBookings.lifecycle.requested",
  "customerBookings.lifecycle.confirmed",
  "customerBookings.lifecycle.diagnosis",
  "customerBookings.lifecycle.approval",
  "customerBookings.lifecycle.repair",
  "customerBookings.lifecycle.collection",
  "customerBookings.lifecycle.complete",
] as const satisfies readonly TranslationKey[];

function RepairLifecycleOverview({ status, t }: { status: CustomerBooking["status"]; t: Translate }) {
  const position: Partial<Record<CustomerBooking["status"], number>> = {
    requested: 0, confirmed: 1, checked_in: 1, diagnosing: 2,
    awaiting_approval: 3, in_service: 4, ready_for_collection: 5, completed: 6,
  };
  const current = position[status] ?? -1;
  const closedEarly = ["declined", "cancelled", "no_show"].includes(status);
  return <section className={`customer-lifecycle-overview${closedEarly ? " lifecycle-closed" : ""}`} aria-label={t("customerBookings.lifecycle.title")}>
    <header><div><h3>{t("customerBookings.lifecycle.title")}</h3><p>{t("customerBookings.lifecycle.description")}</p></div><span>{t(`workshopBookings.status.${status}` as TranslationKey)}</span></header>
    <ol>{lifecycleStages.map((label, index) => <li key={label} className={index < current ? "complete" : index === current ? "current" : "upcoming"}><b>{index < current ? "✓" : index + 1}</b><span>{t(label)}</span></li>)}</ol>
    <small>{t("customerBookings.lifecycle.notifications")}</small>
  </section>;
}

function EstimateDecisionForm({ estimateId, decision, t }: { estimateId: string; decision: "approve" | "decline"; t: Translate }) {
  const [state, action, pending] = useActionState(decideRepairEstimateAction, idle);
  return <form className={`customer-booking-action ${decision === "decline" ? "danger" : ""}`} action={action}>
    <input type="hidden" name="estimateId" value={estimateId} /><input type="hidden" name="decision" value={decision} />
    <label>{t("repairLifecycle.note")}<textarea name="note" rows={2} maxLength={2000} /><CustomerHint>{t("phase6.approvals.noteHelp")}</CustomerHint></label>
    {state.status !== "idle" && <p className={["approved", "estimate_declined"].includes(state.status) ? "note-success" : "note-error"}>{t(`repairLifecycle.customerResult.${state.status}` as TranslationKey)}</p>}
    <button disabled={pending}>{t(pending ? "repairLifecycle.saving" : `repairLifecycle.customerAction.${decision}` as TranslationKey)}</button>
  </form>;
}

function CustomerEstimate({ booking, language, t }: { booking: CustomerBooking; language: Language; t: Translate }) {
  const estimate = booking.estimate;
  if (!estimate) return null;
  return <section className="customer-repair-estimate"><header><div><p>{t("repairLifecycle.estimate")} #{estimate.version}</p><h3>{money(language, estimate.totalCents, estimate.currency)}</h3></div><em>{t(`repairLifecycle.estimateStatus.${estimate.status}` as TranslationKey)}</em></header><p><b>{t("repairLifecycle.diagnosis")}</b>{estimate.diagnosisSummary}</p><table><tbody>{estimate.items.map((item, index) => <tr key={index}><td>{t(`repairLifecycle.type.${item.type}` as TranslationKey)}</td><th>{item.description}</th><td>{item.quantity} × {money(language, item.unitPriceCents, estimate.currency)}</td><td>{money(language, item.lineTotalCents, estimate.currency)}</td></tr>)}</tbody><tfoot><tr><th colSpan={3}>{t("repairLifecycle.total")}</th><td>{money(language, estimate.totalCents, estimate.currency)}</td></tr></tfoot></table>{estimate.customerNote && <p>{estimate.customerNote}</p>}{estimate.status === "awaiting_customer" && <><CustomerDecisionGuide title={t("phase6.approvals.title")} description={t("phase6.approvals.description")} choices={[{ label: t("repairLifecycle.customerAction.approve"), description: t("phase6.approvals.approve") }, { label: t("repairLifecycle.customerAction.decline"), description: t("phase6.approvals.decline") }]} /><div className="customer-estimate-actions"><EstimateDecisionForm estimateId={estimate.id} decision="approve" t={t} /><EstimateDecisionForm estimateId={estimate.id} decision="decline" t={t} /></div></>}{estimate.status === "approved" && booking.status === "awaiting_approval" && <p className="note-success">{t("repairLifecycle.approvedWaiting")}</p>}</section>;
}

function CustomerActionForm({ bookingId, actionKind, t }: {
  bookingId: string;
  actionKind: "accept_proposal" | "decline_proposal" | "cancel";
  t: Translate;
}) {
  const [state, action, pending] = useActionState(manageCustomerBookingAction, idle);
  const cancellation = actionKind === "cancel";
  const optionalNote = actionKind === "decline_proposal";
  return <form className={`customer-booking-action ${cancellation ? "danger" : ""}`} action={action}>
    <input type="hidden" name="bookingId" value={bookingId} />
    <input type="hidden" name="action" value={actionKind} />
    {(cancellation || optionalNote) && <label>
      {t(cancellation ? "customerBookings.cancelReason" : "customerBookings.noteOptional")}
      <textarea name="note" rows={2} maxLength={1000} required={cancellation} />
    </label>}
    {!cancellation && !optionalNote && <input type="hidden" name="note" value="" />}
    {state.status !== "idle" && <p className={["accepted", "declined", "cancelled"].includes(state.status) ? "note-success" : "note-error"} role="status">
      {t(`customerBookings.result.${state.status}` as TranslationKey)}
    </p>}
    <button disabled={pending}>{t(pending ? "customerBookings.saving" : `customerBookings.action.${actionKind}` as TranslationKey)}</button>
  </form>;
}

function ServiceFeedbackForm({ booking, t }: { booking: CustomerBooking; t: Translate }) {
  const [state, action, pending] = useActionState(submitServiceFeedbackAction, idle);
  return <section className="customer-service-feedback"><header><div><p>{t("customerFeedback.eyebrow")}</p><h3>{t("customerFeedback.title")}</h3></div>{booking.feedback && <span>{t("customerFeedback.saved")}</span>}</header><form action={action}><input type="hidden" name="bookingId" value={booking.id} /><fieldset disabled={pending}><legend>{t("customerFeedback.rating")}</legend><div className="customer-rating-options">{[1, 2, 3, 4, 5].map((rating) => <label key={rating}><input type="radio" name="rating" value={rating} defaultChecked={(booking.feedback?.rating ?? 5) === rating} /><span>{rating} ★</span></label>)}</div><label>{t("customerFeedback.comment")}<textarea name="comment" rows={3} maxLength={1000} defaultValue={booking.feedback?.comment ?? ""} placeholder={t("customerFeedback.commentPlaceholder")} /></label></fieldset>{state.status !== "idle" && <p className={state.status === "reviewed" ? "note-success" : "note-error"}>{t(`customerFeedback.result.${state.status}` as TranslationKey)}</p>}<button disabled={pending}>{t(pending ? "customerFeedback.saving" : booking.feedback ? "customerFeedback.update" : "customerFeedback.submit")}</button></form></section>;
}

function MaintenanceToast({ notification, t }: { notification: CustomerMaintenanceNotification; t: Translate }) {
  const [state, action, pending] = useActionState(dismissMaintenanceNotificationAction, idle);
  if (state.status === "dismissed") return null;
  return <aside className="customer-maintenance-toast" role="status"><div><p>{t("maintenanceToast.eyebrow")}</p><h2>{notification.title}</h2><span>{notification.message}</span><small>{notification.workshopName}</small></div><div><Link href={notification.bookingUrl}>{t("maintenanceToast.book")}</Link><form action={action}><input type="hidden" name="notificationId" value={notification.id} /><button disabled={pending} aria-label={t("maintenanceToast.dismiss")}>×</button></form></div></aside>;
}

function BookingCard({ booking, language, t }: { booking: CustomerBooking; language: Language; t: Translate }) {
  const hasProposal = Boolean(booking.proposedStart) && ["requested", "confirmed"].includes(booking.status);
  const primaryTime = booking.confirmedStart || booking.proposedStart || booking.preferredStart;
  const location = [booking.workshopAddress, booking.workshopCity].filter(Boolean).join(", ");
  return <article className={`customer-booking-card status-${booking.status}`}>
    <header>
      <div><p>{booking.serviceCategory}</p><h2>{booking.serviceName}</h2><span>{booking.workshopName}</span></div>
      <div><small>{booking.confirmedStart ? t("customerBookings.confirmedTime") : booking.proposedStart ? t("customerBookings.proposedTime") : t("customerBookings.requestedTime")}</small><DateValue value={primaryTime} language={language} /></div>
      <em>{t(`workshopBookings.status.${booking.status}` as TranslationKey)}</em>
    </header>
    <RepairLifecycleOverview status={booking.status} t={t} />
    {booking.status === "completed" && <ServiceFeedbackForm booking={booking} t={t} />}
    {hasProposal && <section className="customer-proposal">
      <div><p>{t("customerBookings.proposalEyebrow")}</p><h3>{t("customerBookings.proposalTitle")}</h3><DateValue value={booking.proposedStart} language={language} />{booking.proposalNote && <span>{booking.proposalNote}</span>}</div>
      <CustomerDecisionGuide title={t("phase6.proposals.title")} description={t("phase6.proposals.description")} choices={[{ label: t("customerBookings.action.accept_proposal"), description: t("phase6.proposals.accept") }, { label: t("customerBookings.action.decline_proposal"), description: t("phase6.proposals.decline") }]} />
      <div><CustomerActionForm bookingId={booking.id} actionKind="accept_proposal" t={t} /><CustomerActionForm bookingId={booking.id} actionKind="decline_proposal" t={t} /></div>
    </section>}
    <CustomerEstimate booking={booking} language={language} t={t} />
    <div className="customer-booking-detail">
      <section>
        <h3>{t("customerBookings.bookingDetails")}</h3>
        <dl>
          <div><dt>{t("customerBookings.vehicle")}</dt><dd>{booking.vehicleMake} {booking.vehicleModel}{booking.vehicleYear ? ` (${booking.vehicleYear})` : ""}<br /><b>{booking.vehicleRegistration}</b></dd></div>
          <div><dt>{t("customerBookings.preferred")}</dt><dd><DateValue value={booking.preferredStart} language={language} /></dd></div>
          <div><dt>{t("customerBookings.alternate")}</dt><dd><DateValue value={booking.alternateStart} language={language} /></dd></div>
          <div><dt>{t("customerBookings.confirmed")}</dt><dd><DateValue value={booking.confirmedStart} language={language} /></dd></div>
        </dl>
        {(booking.customerNote || booking.workshopNote) && <div className="customer-booking-notes">{booking.customerNote && <p><b>{t("customerBookings.yourNote")}</b>{booking.customerNote}</p>}{booking.workshopNote && <p><b>{t("customerBookings.workshopNote")}</b>{booking.workshopNote}</p>}</div>}
      </section>
      <aside>
        <h3>{t("customerBookings.workshopDetails")}</h3><strong>{booking.workshopName}</strong>
        {location && <address>{location}</address>}
        {booking.workshopPhone && <a href={`tel:${booking.workshopPhone}`}>{booking.workshopPhone}</a>}
        {booking.workshopEmail && <a href={`mailto:${booking.workshopEmail}`}>{booking.workshopEmail}</a>}
        {!location && !booking.workshopPhone && !booking.workshopEmail && <p>{t("customerBookings.contactUnavailable")}</p>}
      </aside>
    </div>
    <details className="customer-booking-history"><summary>{t("customerBookings.history")}</summary>
      <div>{booking.history.map((item, index) => <article key={`${item.createdAt}-${index}`}><span><b>{t(`workshopBookings.history.${item.action}` as TranslationKey)}</b><time>{formatDateTime(language, item.createdAt)}</time></span>{item.note && <p>{item.note}</p>}</article>)}</div>
    </details>
    {booking.canCancel && <details className="customer-cancel"><summary>{t("customerBookings.cancelTitle")}</summary><p>{t("customerBookings.cancelDescription")}</p><CustomerActionForm bookingId={booking.id} actionKind="cancel" t={t} /></details>}
  </article>;
}

export default function CustomerBookingsClient({ bookings, maintenanceNotifications, logoutAction }: { bookings: CustomerBooking[]; maintenanceNotifications: CustomerMaintenanceNotification[]; logoutAction: () => Promise<void> }) {
  const [language, setLanguage, ready] = useLanguage();
  const [filter, setFilter] = useState("all");
  const t = (key: TranslationKey) => translate(language, key);
  const visible = useMemo(() => bookings.filter((booking) => filter === "all" || (filter === "open" ? !["completed", "cancelled", "declined", "no_show"].includes(booking.status) : booking.status === filter)), [bookings, filter]);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  return <main className="settings-shell customer-bookings-shell">
    <header className="settings-topbar"><Link href="/garage">← {t("customerBookings.back")}</Link><strong>pitster</strong><select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("a11y.languageSelector")}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select><form action={logoutAction}><button>{t("auth.logout")}</button></form></header>
    <section className="settings-content customer-bookings-content">
      <p className="registration-kicker">{t("customerBookings.eyebrow")}</p><h1>{t("customerBookings.title")}</h1><p>{t("customerBookings.description")}</p>
      <CustomerPageGuide title={t("phase6.bookings.title")} description={t("phase6.bookings.description")} steps={[t("phase6.bookings.step1"), t("phase6.bookings.step2"), t("phase6.bookings.step3")]} />
      {maintenanceNotifications.length > 0 && <div className="customer-maintenance-toasts">{maintenanceNotifications.map((notification) => <MaintenanceToast key={notification.id} notification={notification} t={t} />)}</div>}
      <div className="booking-inbox-toolbar"><strong>{visible.length} {t("customerBookings.visible")}</strong><label>{t("workshopBookings.filter")}<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">{t("workshopBookings.filter.all")}</option><option value="open">{t("workshopBookings.filter.open")}</option><option value="requested">{t("workshopBookings.status.requested")}</option><option value="confirmed">{t("workshopBookings.status.confirmed")}</option><option value="awaiting_approval">{t("workshopBookings.status.awaiting_approval")}</option><option value="in_service">{t("workshopBookings.status.in_service")}</option><option value="ready_for_collection">{t("workshopBookings.status.ready_for_collection")}</option><option value="completed">{t("workshopBookings.status.completed")}</option><option value="cancelled">{t("workshopBookings.status.cancelled")}</option></select><CustomerHint>{t("phase6.bookings.filterHelp")}</CustomerHint></label></div>
      <div className="customer-booking-list">{visible.map((booking) => <BookingCard key={booking.id} booking={booking} language={language} t={t} />)}{!visible.length && <div className="catalogue-empty"><h2>{t("customerBookings.emptyTitle")}</h2><p>{t("customerBookings.emptyDescription")}</p><Link className="organization-action" href="/workshops">{t("customerBookings.bookService")}</Link></div>}</div>
    </section>
  </main>;
}
