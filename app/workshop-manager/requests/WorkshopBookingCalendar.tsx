"use client";

import { useActionState, useMemo, useState, useTransition, type DragEvent } from "react";
import { type Language, type TranslationKey } from "@/app/i18n";
import type { ManagedWorkshopBooking } from "@/lib/dal/workshop-bookings";
import type { WorkshopOperations } from "@/lib/dal/workshop-operations";
import type { ManagedWorkshopCatalogue } from "@/lib/dal/workshop-services";
import type { BookingResource, WorkshopSchedule } from "@/lib/dal/workshop-scheduling";
import { createManualAppointmentAction, saveBookingScheduleAction, type ManualAppointmentState, type ScheduleActionState } from "./actions";
import { BookingScheduleEditor } from "./WorkshopCapacityControls";
import PlatformDateTimeInput from "@/app/PlatformDateTimeInput";
import Link from "@/app/WorkspaceLink";
import { FieldHelp, OperationalEmptyState } from "@/app/guidance/OperationalGuidance";

type CalendarView = "agenda" | "day" | "week" | "month";
type Translate = (key: TranslationKey) => string;
const idle: ManualAppointmentState = { status: "idle" };

function startOfDay(value: Date) { const date = new Date(value); date.setHours(0, 0, 0, 0); return date; }
function addDays(value: Date, amount: number) { const date = new Date(value); date.setDate(date.getDate() + amount); return date; }
function startOfWeek(value: Date) { return addDays(startOfDay(value), -((value.getDay() + 6) % 7)); }
function dateKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function scheduledStart(booking: ManagedWorkshopBooking) { return booking.confirmedStart ?? booking.proposedStart ?? booking.preferredStart; }
function calendarStatus(booking: ManagedWorkshopBooking) {
  if (booking.status === "requested" && booking.proposedStart) return "proposed";
  if (booking.history[0]?.action === "rescheduled") return "rescheduled";
  return booking.status;
}
function statusKey(status: string): TranslationKey {
  return (status === "proposed" || status === "rescheduled" ? `workshopBookings.calendarStatus.${status}` : `workshopBookings.status.${status}`) as TranslationKey;
}

function CalendarBooking({ booking, language, t, selected, compact, resources, warnings, onSelect }: {
  booking: ManagedWorkshopBooking; language: Language; t: Translate;
  selected: boolean; compact?: boolean; resources: BookingResource[];
  warnings: string[]; onSelect: () => void;
}) {
  const status = calendarStatus(booking);
  return <button type="button" draggable={booking.status === "confirmed"} onDragStart={(event) => event.dataTransfer.setData("text/pitster-booking", booking.id)} className={`calendar-appointment status-${status}${selected ? " selected" : ""}${warnings.length ? " capacity-warning" : ""}`} onClick={onSelect} aria-pressed={selected}>
    <time>{new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(new Date(scheduledStart(booking)))}</time>
    <strong>{booking.customerName} · {booking.vehicleRegistration}</strong>
    {!compact && resources.length > 0 && <span className="calendar-resource-tags">{resources.map((resource) => <b key={resource.id}>{resource.name}</b>)}</span>}
    {warnings.length > 0 && <small className="calendar-warning-count">! {warnings.length}</small>}
    {!compact && <small>{t(statusKey(status))}</small>}
  </button>;
}

function ManualAppointmentForm({ catalogues, language, t }: { catalogues: ManagedWorkshopCatalogue[]; language: Language; t: Translate }) {
  const [state, action, pending] = useActionState(createManualAppointmentAction, idle);
  const [workshopId, setWorkshopId] = useState(catalogues[0]?.workshopId ?? "");
  const services = catalogues.find((catalogue) => catalogue.workshopId === workshopId)?.services.filter((service) => service.active) ?? [];
  return <details className="manual-appointment-panel" id="manual-appointment"><summary>+ {t("workshopBookings.manual.add")}</summary><form action={action}>
    <div className="manual-appointment-grid">
      <label>{t("serviceCatalogue.workshop")}<select name="workshopId" value={workshopId} onChange={(event) => setWorkshopId(event.target.value)} required>{catalogues.map((catalogue) => <option key={catalogue.workshopId} value={catalogue.workshopId}>{catalogue.workshopName}</option>)}</select></label>
      <label>{t("serviceCatalogue.name")}<select name="serviceId" key={workshopId} required>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
      <label>{t("workshopBookings.manual.source")}<select name="source" defaultValue="manager_phone"><option value="manager_phone">{t("workshopBookings.source.manager_phone")}</option><option value="manager_walk_in">{t("workshopBookings.source.manager_walk_in")}</option><option value="manager_other">{t("workshopBookings.source.manager_other")}</option></select></label>
      <label>{t("workshopBookings.action.time")}<PlatformDateTimeInput mode="datetime-local" name="start" required ariaLabel={t("workshopBookings.action.time")} /><FieldHelp>{t("phase3.requests.manualTimeHelp")}</FieldHelp></label>
      <label>{t("calendar.duration")}<select name="durationMinutes" defaultValue="60">{[30, 45, 60, 90, 120, 180].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}</select></label>
      <label>{t("workshopBookings.customer")}<input name="customerName" minLength={2} maxLength={160} required /></label>
      <label>{t("workshopBookings.manual.phone")}<input name="customerPhone" type="tel" maxLength={40} /></label>
      <label>{t("workshopBookings.manual.email")}<input name="customerEmail" type="email" maxLength={320} /></label>
      <label>{t("workshopBookings.manual.registration")}<input name="vehicleRegistration" minLength={2} maxLength={20} required /></label>
      <label>{t("workshopBookings.manual.make")}<input name="vehicleMake" maxLength={80} required /></label>
      <label>{t("workshopBookings.manual.model")}<input name="vehicleModel" maxLength={100} required /></label>
      <label>{t("workshopBookings.manual.year")}<input name="vehicleYear" type="number" min="1886" max="2200" /></label>
      <label>VIN (optional)<input name="vehicleVin" minLength={17} maxLength={17} /></label>
      <label>{t("workshopBookings.mileage")}<input name="mileageKm" type="number" min="0" max="5000000" /></label>
      <label className="manual-customer-states">{t("workshopBookings.customerStates")}<textarea name="customerStates" rows={3} maxLength={2000} placeholder={t("workshopBookings.customerStatesHelp")} /><FieldHelp>{t("phase3.requests.customerStatesHelp")}</FieldHelp></label>
    </div><input type="hidden" name="locale" value={language} />
    {!services.length && <p className="operational-form-notice">{t("phase3.requests.noServices")} <Link href="/workshop-manager/services">{t("serviceCatalogue.title")}</Link></p>}
    {state.status !== "idle" && <p className={state.status === "created" ? "note-success" : "note-error"}>{t(`workshopBookings.manual.result.${state.status}` as TranslationKey)}</p>}
    <button disabled={pending || !services.length}>{t(pending ? "workshopBookings.action.saving" : "workshopBookings.manual.create")}</button>
  </form></details>;
}

export default function WorkshopBookingCalendar({ bookings, catalogues, schedules, assignments, operations, locationName, language, t }: {
  bookings: ManagedWorkshopBooking[]; catalogues: ManagedWorkshopCatalogue[];
  schedules: WorkshopSchedule[]; assignments: Record<string, BookingResource[]>;
  operations: WorkshopOperations[]; locationName: string; language: Language; t: Translate;
}) {
  const [view, setView] = useState<CalendarView>("agenda");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<ScheduleActionState>({ status: "idle" });
  const [dragPending, startDragTransition] = useTransition();
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
  const warningsFor = (booking: ManagedWorkshopBooking) => {
    const warnings: string[] = [];
    const start = new Date(scheduledStart(booking)); const end = new Date(start.getTime() + booking.durationMinutes * 60_000);
    const schedule = schedules.find((item) => item.workshopId === booking.workshopId);
    const operation = operations.find((item) => item.id === booking.workshopId);
    const assigned = assignments[booking.id] ?? [];
    const sameDay = bookings.filter((item) => item.workshopId === booking.workshopId && dateKey(new Date(scheduledStart(item))) === dateKey(start) && !["declined", "cancelled", "no_show"].includes(item.status)).length;
    if (schedule && sameDay > schedule.dailyCapacity) warnings.push(t("capacity.warning.daily"));
    if (schedule?.resources.some((item) => item.active && item.kind === "mechanic") && !assigned.some((item) => item.kind === "mechanic")) warnings.push(t("capacity.warning.mechanic"));
    if (schedule?.resources.some((item) => item.active && item.kind !== "mechanic") && !assigned.some((item) => item.kind !== "mechanic")) warnings.push(t("capacity.warning.facility"));
    if (operation?.closures.some((closure) => new Date(closure.startsAt) < end && new Date(closure.endsAt) > start)) warnings.push(t("capacity.warning.closure"));
    if (operation?.operatingHours.find((item) => item.weekday === start.getDay())?.closed) warnings.push(t("capacity.warning.closed"));
    for (const resource of schedule?.resources.filter((item) => assigned.some((entry) => entry.id === item.id)) ?? []) {
      if (resource.absences.some((absence) => new Date(absence.startsAt) < end && new Date(absence.endsAt) > start)) warnings.push(t("capacity.warning.absence"));
    }
    return [...new Set(warnings)];
  };
  const move = (direction: number) => { const next = new Date(cursor); if (view === "day") next.setDate(next.getDate() + direction); else if (view === "week") next.setDate(next.getDate() + direction * 7); else next.setMonth(next.getMonth() + direction); setCursor(startOfDay(next)); };
  const periodLabel = view === "day" ? new Intl.DateTimeFormat(language, { dateStyle: "full" }).format(cursor) : view === "week" ? `${new Intl.DateTimeFormat(language, { day: "numeric", month: "short" }).format(weekDays[0])} - ${new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric" }).format(weekDays[6])}` : new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(cursor);
  const dropOnDay = (day: Date, bookingId: string) => {
    const booking = bookings.find((item) => item.id === bookingId); if (!booking || booking.status !== "confirmed") return;
    const old = new Date(scheduledStart(booking)); const next = new Date(day); next.setHours(old.getHours(), old.getMinutes(), 0, 0);
    const assigned = assignments[booking.id] ?? [];
    startDragTransition(async () => setDragState(await saveBookingScheduleAction({ bookingId, start: next.toISOString(), durationMinutes: booking.durationMinutes, mechanicId: assigned.find((item) => item.kind === "mechanic")?.id ?? null, facilityId: assigned.find((item) => item.kind !== "mechanic")?.id ?? null })));
  };
  const dropProps = (day: Date) => ({ onDragOver: (event: DragEvent) => event.preventDefault(), onDrop: (event: DragEvent) => { event.preventDefault(); dropOnDay(day, event.dataTransfer.getData("text/pitster-booking")); } });
  const bookingNode = (booking: ManagedWorkshopBooking, compact = false) => <CalendarBooking key={booking.id} booking={booking} language={language} t={t} compact={compact} resources={assignments[booking.id] ?? []} warnings={warningsFor(booking)} selected={selectedId === booking.id} onSelect={() => setSelectedId(booking.id)} />;
  const forDay = (day: Date, compact = false) => { const items = ordered.filter((booking) => dateKey(new Date(scheduledStart(booking))) === dateKey(day)); const shown = compact ? items.slice(0, 3) : items; return <>{shown.map((booking) => bookingNode(booking, compact))}{compact && items.length > shown.length && <small className="calendar-more">+{items.length - shown.length} {t("calendar.more")}</small>}{!items.length && !compact && <small className="calendar-empty">{t("calendar.emptyDay")}</small>}</>; };

  return <section className="appointment-calendar workshop-calendar">
    <header className="calendar-toolbar"><div><p className="calendar-location-context">{t("capacity.calendarFor")}: <span>{locationName}</span></p><h2>{t("workshopBookings.calendar.title")}</h2><strong>{periodLabel}</strong></div><div className="calendar-navigation"><button type="button" onClick={() => move(-1)} aria-label={t("calendar.previous")}>‹</button><button type="button" onClick={() => setCursor(startOfDay(new Date()))}>{t("calendar.today")}</button><button type="button" onClick={() => move(1)} aria-label={t("calendar.next")}>›</button></div><div className="calendar-view-switcher" aria-label={t("calendar.viewLabel")}>{(["agenda", "day", "week", "month"] as CalendarView[]).map((choice) => <button type="button" key={choice} className={view === choice ? "active" : ""} aria-pressed={view === choice} onClick={() => setView(choice)}>{t(`calendar.view.${choice}` as TranslationKey)}</button>)}</div></header>
    <div className="calendar-status-legend">{["requested", "proposed", "confirmed", "rescheduled", "checked_in", "diagnosing", "in_service", "ready_for_collection", "completed", "declined", "cancelled", "no_show"].map((status) => <span className={`status-${status}`} key={status}>{t(statusKey(status))}</span>)}</div>
    {dragState.status !== "idle" && <p className={dragState.status === "saved" ? "note-success" : "note-error"}>{t(`capacity.result.${dragState.status}` as TranslationKey)}{dragPending ? ` ${t("repairLifecycle.saving")}` : ""}</p>}
    <ManualAppointmentForm catalogues={catalogues} language={language} t={t} />
    <div className="calendar-and-details"><div className={`calendar-surface calendar-${view}`}>
      {view === "agenda" && <div className="calendar-agenda-list">{visible.map((booking) => <article {...dropProps(new Date(scheduledStart(booking)))} key={booking.id}><time>{new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "short" }).format(new Date(scheduledStart(booking)))}</time>{bookingNode(booking)}</article>)}{!visible.length && <OperationalEmptyState mark="C" title={t("calendar.noAppointmentsInView")} description={t("phase3.requests.calendarEmpty")} action={<a href="#manual-appointment">+ {t("workshopBookings.manual.add")}</a>} />}</div>}
      {view === "day" && <article {...dropProps(cursor)} className="calendar-day-column"><h3>{new Intl.DateTimeFormat(language, { dateStyle: "full" }).format(cursor)}</h3>{forDay(cursor)}</article>}
      {view === "week" && <div className="calendar-week-grid">{weekDays.map((day) => <article {...dropProps(day)} key={day.toISOString()}><h3>{new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "short" }).format(day)}</h3>{forDay(day)}</article>)}</div>}
      {view === "month" && <div className="calendar-month-grid">{monthDays.map((day) => <article {...dropProps(day)} className={day.getMonth() === cursor.getMonth() ? "" : "outside-month"} key={day.toISOString()}><h3>{new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric" }).format(day)}</h3>{forDay(day, true)}</article>)}</div>}
    </div><aside className="calendar-details" aria-live="polite">{selected ? <><header><div><small>{t("calendar.appointmentDetails")}</small><h3>{selected.customerName}</h3></div><button type="button" onClick={() => setSelectedId(null)} aria-label={t("calendar.closeDetails")}>×</button></header><span className={`calendar-detail-status status-${calendarStatus(selected)}`}>{t(statusKey(calendarStatus(selected)))}</span>{warningsFor(selected).length > 0 && <div className="capacity-warning-list">{warningsFor(selected).map((warning) => <p key={warning}>! {warning}</p>)}</div>}<dl><div><dt>{t("workshopBookings.action.time")}</dt><dd>{new Intl.DateTimeFormat(language, { dateStyle: "full", timeStyle: "short" }).format(new Date(scheduledStart(selected)))}</dd></div><div><dt>{t("calendar.duration")}</dt><dd>{selected.durationMinutes} min</dd></div><div><dt>{t("serviceCatalogue.workshop")}</dt><dd>{selected.workshopName}</dd></div><div><dt>{t("serviceCatalogue.name")}</dt><dd>{selected.serviceName}</dd></div><div><dt>{t("workshopBookings.vehicle")}</dt><dd>{selected.vehicleMake} {selected.vehicleModel} · {selected.vehicleRegistration}</dd></div><div><dt>{t("workshopBookings.contact")}</dt><dd>{selected.customerPhone ?? "—"}<br />{selected.customerEmail ?? "—"}</dd></div><div><dt>{t("workshopBookings.manual.source")}</dt><dd>{t(`workshopBookings.source.${selected.source}` as TranslationKey)}</dd></div>{selected.customerNote && <div><dt>{t("workshopBookings.customerStates")}</dt><dd>{selected.customerNote}</dd></div>}</dl>{["confirmed", "checked_in", "diagnosing", "awaiting_approval", "in_service"].includes(selected.status) && <BookingScheduleEditor booking={selected} schedule={schedules.find((item) => item.workshopId === selected.workshopId)} assigned={assignments[selected.id] ?? []} t={t} />}</> : <p className="calendar-select-prompt">{t("calendar.selectAppointment")}</p>}</aside></div>
  </section>;
}
