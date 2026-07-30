"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { Appointment, DoctorAvailability } from "@/lib/dal/appointments";
import {
  createAppointmentAction,
  transitionAppointmentAction,
  type AppointmentActionState,
} from "./actions";

type DoctorChoice = { id: string; name: string };
type Translator = (key: TranslationKey) => string;
const idle: AppointmentActionState = { status: "idle" };
const blockingStatuses = new Set(["pending", "confirmed", "rescheduled"]);

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
    <select name="status" value={status} onChange={(event) => setStatus(event.target.value)}>
      {choices.map((choice) => <option key={choice} value={choice}>{t(`appointments.status.${choice}` as TranslationKey)}</option>)}
    </select>
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
    <button disabled={pending}>{t(pending ? "appointments.saving" : "appointments.apply")}</button>
    <Feedback state={state} t={t} />
  </form>;
}

function Calendar({
  appointments,
  language,
  t,
}: {
  appointments: Appointment[];
  language: Language;
  t: Translator;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const days = useMemo(() => {
    const today = new Date();
    const monday = new Date(today);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return date;
    });
  }, [weekOffset]);
  return <section className="appointment-calendar">
    <header>
      <h2>{t("calendar.title")}</h2>
      <div><button onClick={() => setWeekOffset((value) => value - 1)} aria-label={t("calendar.previous")}>‹</button>
      <button onClick={() => setWeekOffset(0)}>{t("calendar.today")}</button>
      <button onClick={() => setWeekOffset((value) => value + 1)} aria-label={t("calendar.next")}>›</button></div>
    </header>
    <div className="calendar-grid">
      {days.map((day) => {
        const dayAppointments = appointments.filter((appointment) =>
          dateValue(new Date(appointment.scheduledStart)) === dateValue(day)
          && appointment.status !== "cancelled"
        );
        return <article key={day.toISOString()}>
          <h3>{new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "short" }).format(day)}</h3>
          {dayAppointments.map((appointment) => <div key={appointment.id}>
            <time>{new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(new Date(appointment.scheduledStart))}</time>
            <strong>{appointment.patientName}</strong>
            <small>{t(`appointments.status.${appointment.status}` as TranslationKey)}</small>
          </div>)}
          {!dayAppointments.length && <small>{t("calendar.emptyDay")}</small>}
        </article>;
      })}
    </div>
  </section>;
}

export default function AppointmentManager({
  kind,
  doctors,
  appointments,
  availability,
}: {
  kind: "doctor" | "staff";
  doctors: DoctorChoice[];
  appointments: Appointment[];
  availability: DoctorAvailability[];
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
      <strong>VitaPass</strong>
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
      <Calendar appointments={appointments} language={language} t={t} />
      <h2>{t("appointments.list")}</h2>
      <div className="appointment-list">
        {appointments.length ? appointments.map((appointment) => <article key={appointment.id}>
          <header><div><h3>{appointment.patientName}</h3><p>{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(appointment.scheduledStart))} · {appointment.slotDurationMinutes ?? Math.round((new Date(appointment.scheduledEnd).getTime() - new Date(appointment.scheduledStart).getTime()) / 60_000)} {t("availability.minutes")}</p></div><b>{t(`appointments.status.${appointment.status}` as TranslationKey)}</b></header>
          <p>{appointment.patientPhone} · {t(`appointments.source.${appointment.source}` as TranslationKey)}</p>
          {appointment.operationalNote && <p>{appointment.operationalNote}</p>}
          <TransitionForm appointment={appointment} availability={availability} appointments={appointments} language={language} t={t} />
        </article>) : <p className="organization-card">{t("appointments.empty")}</p>}
      </div>
    </section>
  </main>;
}
