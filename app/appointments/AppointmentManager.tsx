"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { Appointment, DoctorAvailability } from "@/lib/dal/appointments";
import type {
  PublicAppointmentChangeRequest,
  PublicAppointmentRequest,
} from "@/lib/dal/public-appointments";
import {
  createAppointmentAction,
  decideAppointmentChangeRequestAction,
  decideAppointmentRequestAction,
  transitionAppointmentAction,
  type AppointmentActionState,
} from "./actions";

type DoctorChoice = { id: string; name: string };
type Translator = (key: TranslationKey) => string;
const idle: AppointmentActionState = { status: "idle" };
const blockingStatuses = new Set(["pending", "confirmed", "rescheduled"]);

function RequestCard({
  request,
  doctorName,
  language,
  t,
}: {
  request: PublicAppointmentRequest;
  doctorName: string;
  language: Language;
  t: Translator;
}) {
  const [state, action, pending] = useActionState(decideAppointmentRequestAction, idle);
  return <article className="appointment-request-card">
    <div><span>{t("appointments.requestedOnline")}</span><h3>{request.patientName}</h3>
      <p>{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bucharest" }).format(new Date(request.scheduledStart))} · {request.slotDurationMinutes} {t("availability.minutes")}</p>
      <small>{doctorName} · {request.patientPhone} · {request.patientEmail}</small>
      {request.patientNote && <blockquote>{request.patientNote}</blockquote>}
    </div>
    <form action={action}>
      <input type="hidden" name="requestId" value={request.id} />
      <button name="decision" value="declined" className="request-decline" disabled={pending}>{t("appointments.decline")}</button>
      <button name="decision" value="confirmed" disabled={pending}>{t(pending ? "appointments.saving" : "appointments.confirm")}</button>
      <Feedback state={state} t={t} />
    </form>
  </article>;
}

function ChangeRequestCard({
  request,
  doctorName,
  language,
  t,
}: {
  request: PublicAppointmentChangeRequest;
  doctorName: string;
  language: Language;
  t: Translator;
}) {
  const [state, action, pending] = useActionState(
    decideAppointmentChangeRequestAction,
    idle,
  );
  const format = (value: string) => new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Bucharest",
  }).format(new Date(value));
  return <article className="appointment-request-card appointment-change-card">
    <div>
      <span>{t(`appointments.change.${request.requestType}` as TranslationKey)}</span>
      <h3>{request.patientName}</h3>
      <p><b>{t("appointments.currentTime")}:</b> {format(request.currentStart)}</p>
      {request.requestedStart && <p><b>{t("appointments.requestedTime")}:</b> {format(request.requestedStart)} · {request.requestedSlotDurationMinutes} {t("availability.minutes")}</p>}
      <small>{doctorName} · {request.patientPhone} · {request.patientEmail}</small>
      {request.patientNote && <blockquote>{request.patientNote}</blockquote>}
    </div>
    <form action={action}>
      <input type="hidden" name="changeRequestId" value={request.id} />
      <button name="decision" value="declined" className="request-decline" disabled={pending}>
        {t("appointments.decline")}
      </button>
      <button name="decision" value="approved" disabled={pending}>
        {t(pending ? "appointments.saving" : "appointments.approve")}
      </button>
      <Feedback state={state} t={t} />
    </form>
  </article>;
}

function dateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function minutes(value: string) {
  const [hours, minute] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minute;
}

function slotIso(date: string, minuteOfDay: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, Math.floor(minuteOfDay / 60), minuteOfDay % 60).toISOString();
}

function slotsFor({
  clinicianId,
  date,
  availability,
  appointments,
  excludedAppointmentId,
}: {
  clinicianId: string;
  date: string;
  availability: DoctorAvailability[];
  appointments: Appointment[];
  excludedAppointmentId?: string;
}) {
  if (!date) return { duration: null, slots: [] as string[] };
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  const schedule = availability.find((item) =>
    item.clinicianId === clinicianId && item.weekday === weekday && item.isActive
  );
  if (!schedule) return { duration: null, slots: [] as string[] };
  const duration = schedule.slotDurationMinutes;
  const slots: string[] = [];
  for (let value = minutes(schedule.startTime); value + duration <= minutes(schedule.endTime); value += duration) {
    const start = slotIso(date, value);
    const end = new Date(new Date(start).getTime() + duration * 60_000).getTime();
    const startTime = new Date(start).getTime();
    const occupied = appointments.some((appointment) =>
      appointment.id !== excludedAppointmentId
      && appointment.clinicianId === clinicianId
      && blockingStatuses.has(appointment.status)
      && new Date(appointment.scheduledStart).getTime() < end
      && new Date(appointment.scheduledEnd).getTime() > startTime
    );
    if (!occupied && startTime > Date.now()) slots.push(start);
  }
  return { duration, slots };
}

function Feedback({ state, t }: { state: AppointmentActionState; t: Translator }) {
  if (state.status === "idle") return null;
  return <p className={state.status.startsWith("saved") ? "appointment-success" : "appointment-error"} role="status">
    {t(`appointments.feedback.${state.status}` as TranslationKey)}
  </p>;
}

function SlotPicker({
  clinicianId,
  date,
  setDate,
  availability,
  appointments,
  excludedAppointmentId,
  language,
  t,
}: {
  clinicianId: string;
  date: string;
  setDate: (value: string) => void;
  availability: DoctorAvailability[];
  appointments: Appointment[];
  excludedAppointmentId?: string;
  language: Language;
  t: Translator;
}) {
  const result = slotsFor({ clinicianId, date, availability, appointments, excludedAppointmentId });
  return <>
    <label>{t("appointments.date")}<input type="date" value={date} min={dateValue(new Date())} onChange={(event) => setDate(event.target.value)} required /></label>
    <label>{t("appointments.slot")}
      <select name="scheduledStart" required defaultValue="" key={`${clinicianId}-${date}`}>
        <option value="" disabled>{result.slots.length ? t("appointments.chooseSlot") : t("appointments.noSlots")}</option>
        {result.slots.map((slot) => <option value={slot} key={slot}>
          {new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(new Date(slot))}
        </option>)}
      </select>
    </label>
    <input type="hidden" name="slotDurationMinutes" value={result.duration ?? ""} />
  </>;
}

function TransitionForm({
  appointment,
  availability,
  appointments,
  language,
  t,
}: {
  appointment: Appointment;
  availability: DoctorAvailability[];
  appointments: Appointment[];
  language: Language;
  t: Translator;
}) {
  const [state, action, pending] = useActionState(transitionAppointmentAction, idle);
  const [status, setStatus] = useState("confirmed");
  const [date, setDate] = useState(dateValue(new Date(appointment.scheduledStart)));
  if (["cancelled", "completed", "no_show"].includes(appointment.status)) return null;
  const choices = appointment.status === "pending"
    ? ["confirmed", "cancelled"]
    : ["rescheduled", "cancelled", "completed", "no_show"];
  return <form className="appointment-transition" action={action}>
    <input type="hidden" name="appointmentId" value={appointment.id} />
    <label>{t("appointments.chooseAction")}
      <select name="status" value={status} onChange={(event) => setStatus(event.target.value)}>
        {choices.map((choice) => <option key={choice} value={choice}>{t(`appointments.status.${choice}` as TranslationKey)}</option>)}
      </select>
    </label>
    {status === "rescheduled" ? <SlotPicker
      clinicianId={appointment.clinicianId}
      date={date}
      setDate={setDate}
      availability={availability}
      appointments={appointments}
      excludedAppointmentId={appointment.id}
      language={language}
      t={t}
    /> : <>
      <input type="hidden" name="scheduledStart" value="" />
      <input type="hidden" name="slotDurationMinutes" value="" />
    </>}
    <button disabled={pending}>{t(pending ? "appointments.saving" : "appointments.saveAction")}</button>
    <Feedback state={state} t={t} />
  </form>;
}

type CalendarView = "agenda" | "day" | "week" | "month";

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfWeek(value: Date) {
  const date = startOfDay(value);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

function addDays(value: Date, amount: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function CalendarAppointment({
  appointment,
  language,
  t,
  selected,
  onSelect,
  compact = false,
}: {
  appointment: Appointment;
  language: Language;
  t: Translator;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  return <button
    type="button"
    className={`calendar-appointment status-${appointment.status}${selected ? " selected" : ""}`}
    onClick={onSelect}
    aria-pressed={selected}
  >
    <time>{new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(new Date(appointment.scheduledStart))}</time>
    <strong>{appointment.patientName}</strong>
    {!compact && <small>{t(`appointments.status.${appointment.status}` as TranslationKey)}</small>}
  </button>;
}

function Calendar({
  appointments,
  availability,
  doctors,
  language,
  t,
}: {
  appointments: Appointment[];
  availability: DoctorAvailability[];
  doctors: DoctorChoice[];
  language: Language;
  t: Translator;
}) {
  const [view, setView] = useState<CalendarView>("agenda");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = appointments.find((appointment) => appointment.id === selectedId) ?? null;
  const orderedAppointments = useMemo(
    () => [...appointments].sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime()),
    [appointments],
  );
  const weekDays = useMemo(() => {
    const monday = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  }, [cursor]);
  const monthDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  }, [cursor]);
  const visibleAppointments = orderedAppointments.filter((appointment) => {
    const start = new Date(appointment.scheduledStart);
    if (view === "day") return dateValue(start) === dateValue(cursor);
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
    ? new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(cursor)
    : view === "week"
      ? `${new Intl.DateTimeFormat(language, { day: "numeric", month: "short" }).format(weekDays[0])} – ${new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric" }).format(weekDays[6])}`
      : new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(cursor);

  const renderAppointmentsForDay = (day: Date, compact = false) => {
    const items = orderedAppointments.filter((appointment) => dateValue(new Date(appointment.scheduledStart)) === dateValue(day));
    const shown = compact ? items.slice(0, 3) : items;
    return <>
      {shown.map((appointment) => <CalendarAppointment
        key={appointment.id}
        appointment={appointment}
        language={language}
        t={t}
        selected={selectedId === appointment.id}
        onSelect={() => setSelectedId(appointment.id)}
        compact={compact}
      />)}
      {compact && items.length > shown.length && <small className="calendar-more">+{items.length - shown.length} {t("calendar.more")}</small>}
      {!items.length && !compact && <small className="calendar-empty">{t("calendar.emptyDay")}</small>}
    </>;
  };

  return <section className="appointment-calendar">
    <header className="calendar-toolbar">
      <div>
        <h2>{t("calendar.title")}</h2>
        <strong>{periodLabel}</strong>
      </div>
      <div className="calendar-navigation">
        <button type="button" onClick={() => move(-1)} aria-label={t("calendar.previous")}>‹</button>
        <button type="button" onClick={() => setCursor(startOfDay(new Date()))}>{t("calendar.today")}</button>
        <button type="button" onClick={() => move(1)} aria-label={t("calendar.next")}>›</button>
      </div>
      <div className="calendar-view-switcher" aria-label={t("calendar.viewLabel")}>
        {(["agenda", "day", "week", "month"] as CalendarView[]).map((choice) => <button
          type="button"
          key={choice}
          className={view === choice ? "active" : ""}
          aria-pressed={view === choice}
          onClick={() => setView(choice)}
        >{t(`calendar.view.${choice}` as TranslationKey)}</button>)}
      </div>
    </header>
    <div className="calendar-status-legend" aria-label={t("calendar.statusLegend")}>
      {(["pending", "confirmed", "rescheduled", "cancelled", "completed", "no_show"] as Appointment["status"][]).map((status) =>
        <span className={`status-${status}`} key={status}>{t(`appointments.status.${status}` as TranslationKey)}</span>
      )}
    </div>
    <div className="calendar-and-details">
      <div className={`calendar-surface calendar-${view}`}>
        {view === "agenda" && <div className="calendar-agenda-list">
          {visibleAppointments.map((appointment) => <article key={appointment.id}>
            <time>{new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "short" }).format(new Date(appointment.scheduledStart))}</time>
            <CalendarAppointment appointment={appointment} language={language} t={t} selected={selectedId === appointment.id} onSelect={() => setSelectedId(appointment.id)} />
          </article>)}
          {!visibleAppointments.length && <p className="calendar-empty">{t("calendar.noAppointmentsInView")}</p>}
        </div>}
        {view === "day" && <article className="calendar-day-column">
          <h3>{new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "long" }).format(cursor)}</h3>
          {renderAppointmentsForDay(cursor)}
        </article>}
        {view === "week" && <div className="calendar-week-grid">
          {weekDays.map((day) => <article key={day.toISOString()}>
            <h3>{new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "short" }).format(day)}</h3>
            {renderAppointmentsForDay(day)}
          </article>)}
        </div>}
        {view === "month" && <div className="calendar-month-grid">
          {monthDays.map((day) => <article className={day.getMonth() === cursor.getMonth() ? "" : "outside-month"} key={day.toISOString()}>
            <h3>{new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric" }).format(day)}</h3>
            {renderAppointmentsForDay(day, true)}
          </article>)}
        </div>}
      </div>
      <aside className="calendar-details" aria-live="polite">
        {selected ? <>
          <header>
            <div><small>{t("calendar.appointmentDetails")}</small><h3>{selected.patientName}</h3></div>
            <button type="button" onClick={() => setSelectedId(null)} aria-label={t("calendar.closeDetails")}>×</button>
          </header>
          <span className={`calendar-detail-status status-${selected.status}`}>{t(`appointments.status.${selected.status}` as TranslationKey)}</span>
          <dl>
            <div><dt>{t("appointments.date")}</dt><dd>{new Intl.DateTimeFormat(language, { dateStyle: "full", timeStyle: "short" }).format(new Date(selected.scheduledStart))}</dd></div>
            <div><dt>{t("calendar.duration")}</dt><dd>{selected.slotDurationMinutes ?? Math.round((new Date(selected.scheduledEnd).getTime() - new Date(selected.scheduledStart).getTime()) / 60_000)} {t("availability.minutes")}</dd></div>
            <div><dt>{t("appointments.doctor")}</dt><dd>{doctors.find((doctor) => doctor.id === selected.clinicianId)?.name ?? "—"}</dd></div>
            <div><dt>{t("appointments.patientPhone")}</dt><dd>{selected.patientPhone}</dd></div>
            {selected.patientEmail && <div><dt>{t("appointments.patientEmail")}</dt><dd>{selected.patientEmail}</dd></div>}
            <div><dt>{t("appointments.source")}</dt><dd>{t(`appointments.source.${selected.source}` as TranslationKey)}</dd></div>
            {selected.operationalNote && <div><dt>{t("appointments.note")}</dt><dd>{selected.operationalNote}</dd></div>}
          </dl>
          <TransitionForm appointment={selected} availability={availability} appointments={appointments} language={language} t={t} />
        </> : <p className="calendar-select-prompt">{t("calendar.selectAppointment")}</p>}
      </aside>
    </div>
  </section>;
}

export default function AppointmentManager({
  kind,
  doctors,
  appointments,
  availability,
  requests,
  changeRequests,
}: {
  kind: "doctor" | "staff";
  doctors: DoctorChoice[];
  appointments: Appointment[];
  availability: DoctorAvailability[];
  requests: PublicAppointmentRequest[];
  changeRequests: PublicAppointmentChangeRequest[];
}) {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  const [state, action, pending] = useActionState(createAppointmentAction, idle);
  const [clinicianId, setClinicianId] = useState(doctors[0]?.id ?? "");
  const [date, setDate] = useState(dateValue(new Date()));
  const doctorName = doctors.find((doctor) => doctor.id === clinicianId)?.name ?? "";
  if (!ready) return <main className="organization-shell" aria-busy="true" />;

  return <main className="organization-shell">
    <header className="organization-topbar">
      <strong>pitster</strong>
      {kind === "doctor" && <Link href="/doctor/availability">{t("availability.title")}</Link>}
      <Link href={kind === "doctor" ? "/doctor" : "/staff"}>{t("appointments.back")}</Link>
      <select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("a11y.languageSelector")}>
        <option value="en">{t("language.en")}</option><option value="de">{t("language.de")}</option><option value="ro">{t("language.ro")}</option><option value="hu">{t("language.hu")}</option>
      </select>
    </header>
    <section className="appointment-content">
      <p className="registration-kicker">{t("appointments.eyebrow")}</p>
      <h1>{t("appointments.title")}</h1>
      <p>{t("appointments.description")}</p>
      {kind === "staff" && <p className="appointment-scope-note">{t("appointments.staffScope")}</p>}
      <section className="appointment-request-queue">
        <div><span>{requests.filter((request) => request.status === "pending").length}</span><div><h2>{t("appointments.requestQueue")}</h2><p>{t("appointments.requestQueueHelp")}</p></div></div>
        {requests.filter((request) => request.status === "pending").map((request) => <RequestCard
          key={request.id}
          request={request}
          doctorName={doctors.find((doctor) => doctor.id === request.clinicianId)?.name ?? ""}
          language={language}
          t={t}
        />)}
        {!requests.some((request) => request.status === "pending") && <p className="booking-empty compact">{t("appointments.noPendingRequests")}</p>}
      </section>
      <section className="appointment-request-queue appointment-change-queue">
        <div><span>{changeRequests.filter((request) => request.status === "pending").length}</span><div><h2>{t("appointments.changeQueue")}</h2><p>{t("appointments.changeQueueHelp")}</p></div></div>
        {changeRequests.filter((request) => request.status === "pending").map((request) => <ChangeRequestCard
          key={request.id}
          request={request}
          doctorName={doctors.find((doctor) => doctor.id === request.clinicianId)?.name ?? ""}
          language={language}
          t={t}
        />)}
        {!changeRequests.some((request) => request.status === "pending") && <p className="booking-empty compact">{t("appointments.noPendingChanges")}</p>}
      </section>
      <section className="appointment-section-heading">
        <p className="registration-kicker">{t("appointments.quickAdd")}</p>
        <h2>{t("appointments.quickAddTitle")}</h2>
        <p>{t("appointments.quickAddHelp")}</p>
      </section>
      <form className="appointment-form" action={action}>
        <input type="hidden" name="locale" value={language} />
        <input type="hidden" name="doctorName" value={doctorName} />
        <label>{t("appointments.doctor")}<select name="clinicianId" required value={clinicianId} onChange={(event) => setClinicianId(event.target.value)}>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></label>
        <label>{t("appointments.patientName")}<input name="patientName" required maxLength={160} /></label>
        <label>{t("appointments.patientPhone")}<input name="patientPhone" required placeholder="07xxxxxxxx" /></label>
        <label>{t("appointments.patientEmail")}<input type="email" name="patientEmail" required /></label>
        <label>{t("appointments.source")}<select name="source"><option value="phone">{t("appointments.source.phone")}</option><option value="walk_in">{t("appointments.source.walk_in")}</option><option value="online">{t("appointments.source.online")}</option><option value="email">{t("appointments.source.email")}</option><option value="other">{t("appointments.source.other")}</option></select></label>
        <SlotPicker clinicianId={clinicianId} date={date} setDate={setDate} availability={availability} appointments={appointments} language={language} t={t} />
        <label>{t("appointments.initialStatus")}<select name="initialStatus"><option value="pending">{t("appointments.status.pending")}</option><option value="confirmed">{t("appointments.status.confirmed")}</option></select></label>
        <label className="appointment-wide">{t("appointments.note")}<textarea name="operationalNote" maxLength={500} /></label>
        <button disabled={pending || !clinicianId}>{t(pending ? "appointments.saving" : "appointments.create")}</button>
        <Feedback state={state} t={t} />
      </form>
      <Calendar appointments={appointments} availability={availability} doctors={doctors} language={language} t={t} />
    </section>
  </main>;
}
