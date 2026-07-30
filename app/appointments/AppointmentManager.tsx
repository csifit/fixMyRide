"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { Appointment } from "@/lib/dal/appointments";
import {
  createAppointmentAction,
  transitionAppointmentAction,
  type AppointmentActionState,
} from "./actions";

type DoctorChoice = { id: string; name: string };
const idle: AppointmentActionState = { status: "idle" };
const toIso = (value: string) => value ? new Date(value).toISOString() : "";

function Feedback({ state, t }: {
  state: AppointmentActionState;
  t: (key: TranslationKey) => string;
}) {
  if (state.status === "idle") return null;
  return <p className={state.status.startsWith("saved") ? "appointment-success" : "appointment-error"} role="status">
    {t(`appointments.feedback.${state.status}` as TranslationKey)}
  </p>;
}

function TransitionForm({ appointment, t }: {
  appointment: Appointment;
  t: (key: TranslationKey) => string;
}) {
  const [state, action, pending] = useActionState(transitionAppointmentAction, idle);
  const [status, setStatus] = useState("confirmed");
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  if (["cancelled", "completed", "no_show"].includes(appointment.status)) return null;
  const choices = appointment.status === "pending"
    ? ["confirmed", "cancelled"]
    : ["rescheduled", "cancelled", "completed", "no_show"];
  return <form className="appointment-transition" action={action} onSubmit={(event) => {
    const form = event.currentTarget;
    (form.elements.namedItem("scheduledStart") as HTMLInputElement).value =
      toIso(startRef.current?.value ?? "");
    (form.elements.namedItem("scheduledEnd") as HTMLInputElement).value =
      toIso(endRef.current?.value ?? "");
  }}>
    <input type="hidden" name="appointmentId" value={appointment.id} />
    <input type="hidden" name="scheduledStart" />
    <input type="hidden" name="scheduledEnd" />
    <select name="status" value={status} onChange={(event) => setStatus(event.target.value)}>
      {choices.map((choice) => <option key={choice} value={choice}>{t(`appointments.status.${choice}` as TranslationKey)}</option>)}
    </select>
    {status === "rescheduled" && <>
      <label>{t("appointments.start")}<input ref={startRef} type="datetime-local" required /></label>
      <label>{t("appointments.end")}<input ref={endRef} type="datetime-local" required /></label>
    </>}
    <button disabled={pending}>{t(pending ? "appointments.saving" : "appointments.apply")}</button>
    <Feedback state={state} t={t} />
  </form>;
}

export default function AppointmentManager({
  kind,
  doctors,
  appointments,
}: {
  kind: "doctor" | "staff";
  doctors: DoctorChoice[];
  appointments: Appointment[];
}) {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  const [state, action, pending] = useActionState(createAppointmentAction, idle);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  if (!ready) return <main className="organization-shell" aria-busy="true" />;

  return <main className="organization-shell">
    <header className="organization-topbar">
      <strong>VitaPass</strong>
      <Link href={kind === "doctor" ? "/doctor" : "/staff"}>{t("appointments.back")}</Link>
      <select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("a11y.languageSelector")}>
        <option value="en">{t("language.en")}</option><option value="de">{t("language.de")}</option><option value="ro">{t("language.ro")}</option><option value="hu">{t("language.hu")}</option>
      </select>
    </header>
    <section className="appointment-content">
      <p className="registration-kicker">{t("appointments.eyebrow")}</p>
      <h1>{t("appointments.title")}</h1>
      <p>{t("appointments.description")}</p>
      <form className="appointment-form" action={action} onSubmit={(event) => {
        const form = event.currentTarget;
        (form.elements.namedItem("scheduledStart") as HTMLInputElement).value =
          toIso(startRef.current?.value ?? "");
        (form.elements.namedItem("scheduledEnd") as HTMLInputElement).value =
          toIso(endRef.current?.value ?? "");
      }}>
        <input type="hidden" name="scheduledStart" /><input type="hidden" name="scheduledEnd" />
        <input type="hidden" name="locale" value={language} />
        <label>{t("appointments.doctor")}<select name="clinicianId" required>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></label>
        <label>{t("appointments.patientName")}<input name="patientName" required maxLength={160} /></label>
        <label>{t("appointments.patientPhone")}<input name="patientPhone" required placeholder="07xxxxxxxx" /></label>
        <label>{t("appointments.patientEmail")}<input type="email" name="patientEmail" /></label>
        <label>{t("appointments.source")}<select name="source"><option value="phone">{t("appointments.source.phone")}</option><option value="walk_in">{t("appointments.source.walk_in")}</option><option value="online">{t("appointments.source.online")}</option><option value="email">{t("appointments.source.email")}</option><option value="other">{t("appointments.source.other")}</option></select></label>
        <label>{t("appointments.start")}<input ref={startRef} type="datetime-local" required /></label>
        <label>{t("appointments.end")}<input ref={endRef} type="datetime-local" required /></label>
        <label>{t("appointments.initialStatus")}<select name="initialStatus"><option value="pending">{t("appointments.status.pending")}</option><option value="confirmed">{t("appointments.status.confirmed")}</option></select></label>
        <label className="appointment-wide">{t("appointments.note")}<textarea name="operationalNote" maxLength={500} /></label>
        <button disabled={pending}>{t(pending ? "appointments.saving" : "appointments.create")}</button>
        <Feedback state={state} t={t} />
      </form>
      <h2>{t("appointments.list")}</h2>
      <div className="appointment-list">
        {appointments.length ? appointments.map((appointment) => <article key={appointment.id}>
          <header><div><h3>{appointment.patientName}</h3><p>{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(appointment.scheduledStart))}</p></div><b>{t(`appointments.status.${appointment.status}` as TranslationKey)}</b></header>
          <p>{appointment.patientPhone} · {t(`appointments.source.${appointment.source}` as TranslationKey)}</p>
          {appointment.operationalNote && <p>{appointment.operationalNote}</p>}
          <TransitionForm appointment={appointment} t={t} />
        </article>) : <p className="organization-card">{t("appointments.empty")}</p>}
      </div>
    </section>
  </main>;
}
