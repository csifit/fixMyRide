"use client";

import { useActionState, useMemo, useState } from "react";
import { type Language, type TranslationKey } from "@/app/i18n";
import type { ManagedWorkshopBooking } from "@/lib/dal/workshop-bookings";
import type { ManagedWorkshopCatalogue } from "@/lib/dal/workshop-services";
import { createManualAppointmentAction, type ManualAppointmentState } from "./actions";

type CalendarView = "agenda" | "day" | "week" | "month";
type Translate = (key: TranslationKey) => string;
const idle: ManualAppointmentState = { status: "idle" };

function startOfDay(value: Date) { const date = new Date(value); date.setHours(0, 0, 0, 0); return date; }
function addDays(value: Date, amount: number) { const date = new Date(value); date.setDate(date.getDate() + amount); return date; }
function startOfWeek(value: Date) { const date = startOfDay(value); return addDays(date, -((date.getDay() + 6) % 7)); }
function dateKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function scheduledStart(booking: ManagedWorkshopBooking) { return booking.confirmedStart ?? booking.proposedStart ?? booking.preferredStart; }
function calendarStatus(booking: ManagedWorkshopBooking) {
  if (booking.status === "requested" && booking.proposedStart) return "proposed";
  if (booking.history[0]?.action === "rescheduled") return "rescheduled";
  return booking.status;
}
function statusKey(status: string): TranslationKey {
  if (status === "proposed" || status === "rescheduled") return `workshopBookings.calendarStatus.${status}` as TranslationKey;
  return `workshopBookings.status.${status}` as TranslationKey;
}

function CalendarBooking({ booking, language, t, selected, compact, onSelect }: {
  booking: ManagedWorkshopBooking; language: Language; t: Translate;
  selected: boolean; compact?: boolean; onSelect: () => void;
}) {
  const status = calendarStatus(booking);
  return <button type="button" className={`calendar-appointment status-${status}${selected ? " selected" : ""}`} onClick={onSelect} aria-pressed={selected}>
    <time>{new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(new Date(scheduledStart(booking)))}</time>
    <strong>{booking.customerName} · {booking.vehicleRegistration}</strong>
    {!compact && <small>{t(statusKey(status))}</small>}
  </button>;
}

function ManualAppointmentForm({ catalogues, language, t }: {
  catalogues: ManagedWorkshopCatalogue[]; language: Language; t: Translate;
}) {
  const [state, action, pending] = useActionState(createManualAppointmentAction, idle);
  const [workshopId, setWorkshopId] = useState(catalogues[0]?.workshopId ?? "");
  const services = catalogues.find((catalogue) => catalogue.workshopId === workshopId)?.services.filter((service) => service.active) ?? [];
  return <details className="manual-appointment-panel">
    <summary>+ {t("workshopBookings.manual.add")}</summary>
    <form action={action}>
      <div className="manual-appointment-grid">
        <label>{t("serviceCatalogue.workshop")}<select name="workshopId" value={workshopId} onChange={(event) => setWorkshopId(event.target.value)} required>{catalogues.map((catalogue) => <option key={catalogue.workshopId} value={catalogue.workshopId}>{catalogue.workshopName}</option>)}</select></label>
        <label>{t("serviceCatalogue.name")}<select name="serviceId" key={workshopId} required>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
        <label>{t("workshopBookings.manual.source")}<select name="source" defaultValue="manager_phone"><option value="manager_phone">{t("workshopBookings.source.manager_phone")}</option><option value="manager_walk_in">{t("workshopBookings.source.manager_walk_in")}</option><option value="manager_other">{t("workshopBookings.source.manager_other")}</option></select></label>
        <label>{t("workshopBookings.action.time")}<input name="start" type="datetime-local" required /></label>
        <label>{t("calendar.duration")}<select name="durationMinutes" defaultValue="60"><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option><option value="90">90 min</option><option value="120">120 min</option><option value="180">180 min</option></select></label>
        <label>{t("workshopBookings.customer")}<input name="customerName" minLength={2} maxLength={160} required /></label>
        <label>{t("workshopBookings.manual.phone")}<input name="customerPhone" type="tel" maxLength={40} /></label>
        <label>{t("workshopBookings.manual.email")}<input name="customerEmail" type="email" maxLength={320} /></label>
        <label>{t("workshopBookings.manual.registration")}<input name="vehicleRegistration" minLength={2} maxLength={20} required /></label>
        <label>{t("workshopBookings.manual.make")}<input name="vehicleMake" maxLength={80} required /></label>
        <label>{t("workshopBookings.manual.model")}<input name="vehicleModel" maxLength={100} required /></label>
        <label>{t("workshopBookings.manual.year")}<input name="vehicleYear" type="number" min="1886" max="2200" /></label>
        <label>{t("workshopBookings.mileage")}<input name="mileageKm" type="number" min="0" max="5000000" /></label>
        <label className="manual-customer-states">{t("workshopBookings.customerStates")}<textarea name="customerStates" rows={3} maxLength={2000} placeholder={t("workshopBookings.customerStatesHelp")} /></label>
      </div>
      <input type="hidden" name="locale" value={language} />
      {state.status !== "idle" && <p className={state.status === "created" ? "note-success" : "note-error"}>{t(`workshopBookings.manual.result.${state.status}` as TranslationKey)}</p>}
      <button disabled={pending || !services.length}>{t(pending ? "workshopBookings.action.saving" : "workshopBookings.manual.create")}</button>
    </form>
  </details>;
}

export default function WorkshopBookingCalendar({ bookings, catalogues, language, t }: {
  bookings: ManagedWorkshopBooking[]; catalogues: ManagedWorkshopCatalogue[];
  language: Language; t: Translate;
}) {
  const [view, setView] = useState<CalendarView>("agenda");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = bookings.find((booking) => booking.id === selectedId) ?? null;
  const ordered = useMemo(() => [...bookings].sort((a, b) => new Date(scheduledStart(a)).getTime() - new Date(scheduledStart(b)).getTime()), [bookings]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(cursor), index)), [cursor]);
  const monthDays = useMemo(() => Array.from({ length: 42 }, (_, index) => addDays(startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1)), index)), [cursor]);
  const visible = ordered.filter((booking) => {
    const start = new Date(scheduledStart(booking));
    if (view === "day") return dateKey(start) === dateKey(cursor);
    if (view === "week") return start >= weekDays[0] && start < addDays(weekDays[6], 1);
    return start.getFullYear() === cursor.getFullYear() && start.getMonth() === cursor.getMonth();
  });
  const move = (direction: number) => {
    const next = new Date(cursor);
    if (view === "day") next.setDate(next.getDate() + direction);
    else if (view === "week") next.setDate(next.getDate() + direction * 7);
    else next.setMonth(next.getMonth() + direction);
    setCursor(startOfDay(next));
  };
  const periodLabel = view === "day"
    ? new Intl.DateTimeFormat(language, { dateStyle: "full" }).format(cursor)
    : view === "week"
      ? `${new Intl.DateTimeFormat(language, { day: "numeric", month: "short" }).format(weekDays[0])} – ${new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric" }).format(weekDays[6])}`
      : new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(cursor);
  const forDay = (day: Date, compact = false) => {
    const items = ordered.filter((booking) => dateKey(new Date(scheduledStart(booking))) === dateKey(day));
    const shown = compact ? items.slice(0, 3) : items;
    return <>{shown.map((booking) => <CalendarBooking key={booking.id} booking={booking} language={language} t={t} compact={compact} selected={selectedId === booking.id} onSelect={() => setSelectedId(booking.id)} />)}{compact && items.length > shown.length && <small className="calendar-more">+{items.length - shown.length} {t("calendar.more")}</small>}{!items.length && !compact && <small className="calendar-empty">{t("calendar.emptyDay")}</small>}</>;
  };

  return <section className="appointment-calendar workshop-calendar">
    <header className="calendar-toolbar"><div><h2>{t("workshopBookings.calendar.title")}</h2><strong>{periodLabel}</strong></div><div className="calendar-navigation"><button type="button" onClick={() => move(-1)} aria-label={t("calendar.previous")}>‹</button><button type="button" onClick={() => setCursor(startOfDay(new Date()))}>{t("calendar.today")}</button><button type="button" onClick={() => move(1)} aria-label={t("calendar.next")}>›</button></div><div className="calendar-view-switcher" aria-label={t("calendar.viewLabel")}>{(["agenda", "day", "week", "month"] as CalendarView[]).map((choice) => <button type="button" key={choice} className={view === choice ? "active" : ""} aria-pressed={view === choice} onClick={() => setView(choice)}>{t(`calendar.view.${choice}` as TranslationKey)}</button>)}</div></header>
    <div className="calendar-status-legend">{["requested", "proposed", "confirmed", "rescheduled", "checked_in", "diagnosing", "in_service", "ready_for_collection", "completed", "declined", "cancelled", "no_show"].map((status) => <span className={`status-${status}`} key={status}>{t(statusKey(status))}</span>)}</div>
    <ManualAppointmentForm catalogues={catalogues} language={language} t={t} />
    <div className="calendar-and-details"><div className={`calendar-surface calendar-${view}`}>
      {view === "agenda" && <div className="calendar-agenda-list">{visible.map((booking) => <article key={booking.id}><time>{new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "short" }).format(new Date(scheduledStart(booking)))}</time><CalendarBooking booking={booking} language={language} t={t} selected={selectedId === booking.id} onSelect={() => setSelectedId(booking.id)} /></article>)}{!visible.length && <p className="calendar-empty">{t("calendar.noAppointmentsInView")}</p>}</div>}
      {view === "day" && <article className="calendar-day-column"><h3>{new Intl.DateTimeFormat(language, { dateStyle: "full" }).format(cursor)}</h3>{forDay(cursor)}</article>}
      {view === "week" && <div className="calendar-week-grid">{weekDays.map((day) => <article key={day.toISOString()}><h3>{new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "short" }).format(day)}</h3>{forDay(day)}</article>)}</div>}
      {view === "month" && <div className="calendar-month-grid">{monthDays.map((day) => <article className={day.getMonth() === cursor.getMonth() ? "" : "outside-month"} key={day.toISOString()}><h3>{new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric" }).format(day)}</h3>{forDay(day, true)}</article>)}</div>}
    </div><aside className="calendar-details" aria-live="polite">{selected ? <><header><div><small>{t("calendar.appointmentDetails")}</small><h3>{selected.customerName}</h3></div><button type="button" onClick={() => setSelectedId(null)} aria-label={t("calendar.closeDetails")}>×</button></header><span className={`calendar-detail-status status-${calendarStatus(selected)}`}>{t(statusKey(calendarStatus(selected)))}</span><dl><div><dt>{t("workshopBookings.action.time")}</dt><dd>{new Intl.DateTimeFormat(language, { dateStyle: "full", timeStyle: "short" }).format(new Date(scheduledStart(selected)))}</dd></div><div><dt>{t("calendar.duration")}</dt><dd>{selected.durationMinutes} min</dd></div><div><dt>{t("serviceCatalogue.workshop")}</dt><dd>{selected.workshopName}</dd></div><div><dt>{t("serviceCatalogue.name")}</dt><dd>{selected.serviceName}</dd></div><div><dt>{t("workshopBookings.vehicle")}</dt><dd>{selected.vehicleMake} {selected.vehicleModel} · {selected.vehicleRegistration}</dd></div><div><dt>{t("workshopBookings.contact")}</dt><dd>{selected.customerPhone ?? "—"}<br />{selected.customerEmail ?? "—"}</dd></div><div><dt>{t("workshopBookings.manual.source")}</dt><dd>{t(`workshopBookings.source.${selected.source}` as TranslationKey)}</dd></div>{selected.customerNote && <div><dt>{t("workshopBookings.customerStates")}</dt><dd>{selected.customerNote}</dd></div>}</dl></> : <p className="calendar-select-prompt">{t("calendar.selectAppointment")}</p>}</aside></div>
  </section>;
}
