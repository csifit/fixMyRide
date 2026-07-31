"use client";

import Link from "next/link";
import { useActionState } from "react";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { brand } from "@/lib/brand";
import type { PatientAppointment } from "@/lib/dal/patient-appointments";
import type { PublicSlot } from "@/lib/dal/public-appointments";
import {
  cancelMyAppointmentRequestAction,
  createMyAppointmentChangeAction,
  patientLogoutAction,
  type PatientAppointmentActionState,
} from "../actions";

const idle: PatientAppointmentActionState = { status: "idle" };

function Feedback({
  state,
  t,
}: {
  state: PatientAppointmentActionState;
  t: (key: TranslationKey) => string;
}) {
  if (state.status === "idle") return null;
  return <p className={state.status === "saved" ? "appointment-success" : "appointment-error"} role="status">
    {t(`patientAppointments.feedback.${state.status}` as TranslationKey)}
  </p>;
}

export default function PatientAppointmentCenter({
  patientName,
  appointments,
  selectedId,
  selectedDate,
  currentDate,
  slots,
  unavailable = false,
}: {
  patientName: string;
  appointments: PatientAppointment[];
  selectedId: string | null;
  selectedDate: string;
  currentDate: string;
  slots: PublicSlot[];
  unavailable?: boolean;
}) {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  const selected = appointments.find((item) => item.id === selectedId) ?? null;
  const [cancelState, cancelAction, cancelling] = useActionState(
    cancelMyAppointmentRequestAction,
    idle,
  );
  const [changeState, changeAction, changing] = useActionState(
    createMyAppointmentChangeAction,
    idle,
  );
  const format = (value: string) => new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Bucharest",
  }).format(new Date(value));
  const upcoming = appointments.filter((item) =>
    ["pending", "confirmed"].includes(item.status)
    && item.scheduledStart.slice(0, 10) >= currentDate
  ).sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  const history = appointments.filter((item) => !upcoming.includes(item));
  const bookingLink = (id: string) => `/patient/appointments?booking=${id}`;
  if (!ready) return <main className="patient-appointment-shell" aria-busy="true" />;

  return <main className="patient-appointment-shell">
    <header className="patient-appointment-header">
      <Link className="booking-logo" href="/"><span>{brand.mark}</span>{brand.name}</Link>
      <nav>
        <Link href="/">{t("patientAppointments.medicalFolder")}</Link>
        <Link href="/appointments">{t("booking.findDoctor")}</Link>
      </nav>
      <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label={t("a11y.languageSelector")}>
        <option value="en">{t("language.en")}</option><option value="de">{t("language.de")}</option><option value="ro">{t("language.ro")}</option><option value="hu">{t("language.hu")}</option>
      </select>
      <form action={patientLogoutAction}><button>{t("patientAppointments.signOut")}</button></form>
    </header>
    <section className="patient-appointment-intro">
      <div><p className="registration-kicker">{t("patientAppointments.eyebrow")}</p>
        <h1>{t("patientAppointments.title")}</h1>
        <p>{t("patientAppointments.welcome").replace("{name}", patientName)}</p>
      </div>
      <Link className="booking-primary" href="/appointments">{t("patientAppointments.bookNew")}</Link>
    </section>

    {unavailable ? <section className="booking-empty"><h2>{t("patientAppointments.unavailable")}</h2></section>
      : !appointments.length ? <section className="booking-empty"><h2>{t("patientAppointments.empty")}</h2><p>{t("patientAppointments.emptyHelp")}</p></section>
      : <div className="patient-appointment-layout">
        <aside className="patient-appointment-list">
          <h2>{t("patientAppointments.upcoming")}</h2>
          {upcoming.map((item) => <Link href={bookingLink(item.id)} className={item.id === selectedId ? "active" : ""} key={item.id}>
            <time>{format(item.scheduledStart)}</time><strong>{item.doctorName}</strong><small>{t(`booking.status.${item.status}` as TranslationKey)}</small>
          </Link>)}
          {!upcoming.length && <p>{t("patientAppointments.noneUpcoming")}</p>}
          <h2>{t("patientAppointments.history")}</h2>
          {history.map((item) => <Link href={bookingLink(item.id)} className={item.id === selectedId ? "active" : ""} key={item.id}>
            <time>{format(item.scheduledStart)}</time><strong>{item.doctorName}</strong><small>{t(`booking.status.${item.status}` as TranslationKey)}</small>
          </Link>)}
        </aside>

        {selected && <section className="patient-appointment-detail">
          <div className="patient-appointment-status">
            <span>{t(`booking.status.${selected.status}` as TranslationKey)}</span>
            <small>{t(`appointments.source.${selected.source}` as TranslationKey)}</small>
          </div>
          <h2>{selected.doctorName}</h2>
          <p>{selected.specialty} · {selected.clinicName}</p>
          <div className="patient-appointment-time"><strong>{format(selected.scheduledStart)}</strong><small>{selected.slotDurationMinutes} {t("availability.minutes")}</small></div>

          {selected.changeRequest?.status === "pending" && <div className="booking-change-panel pending">
            <h3>{t("booking.changePending")}</h3>
            <p>{t(`booking.changePending.${selected.changeRequest.requestType}` as TranslationKey)}</p>
            {selected.changeRequest.requestedStart && <strong>{format(selected.changeRequest.requestedStart)}</strong>}
            <small>{t("booking.originalAppointmentRemains")}</small>
          </div>}

          {selected.status === "pending" && selected.publicRequestId && <form className="booking-change-panel" action={cancelAction}>
            <input type="hidden" name="publicRequestId" value={selected.publicRequestId} />
            <h3>{t("booking.cancelRequest")}</h3><p>{t("booking.cancelRequestHelp")}</p>
            <label className="booking-confirm-check"><input type="checkbox" name="confirmed" value="yes" required />{t("booking.confirmCancellation")}</label>
            <button className="request-decline" disabled={cancelling}>{t(cancelling ? "booking.sending" : "booking.cancelRequestButton")}</button>
            <Feedback state={cancelState} t={t} />
          </form>}

          {selected.status === "confirmed" && selected.publicRequestId
            && selected.changeRequest?.status !== "pending" && <div className="patient-change-grid">
            <form className="booking-change-panel" action={changeAction}>
              <input type="hidden" name="publicRequestId" value={selected.publicRequestId} />
              <input type="hidden" name="requestType" value="reschedule" />
              <input type="hidden" name="confirmed" value="yes" />
              <h3>{t("booking.rescheduleAppointment")}</h3><p>{t("booking.rescheduleHelp")}</p>
              <label>{t("booking.date")}<input type="date" value={selectedDate} min={currentDate} onChange={(event) => {
                window.location.href = `/patient/appointments?booking=${selected.id}&date=${event.target.value}`;
              }} /></label>
              <fieldset className="booking-reschedule-grid"><legend>{t("booking.selectNewTime")}</legend>
                {slots.map((slot) => <label key={slot.scheduledStart}><input type="radio" name="scheduledStart" value={slot.scheduledStart} required /><span>{new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest" }).format(new Date(slot.scheduledStart))}</span><input type="hidden" name="slotDurationMinutes" value={slot.slotDurationMinutes} /></label>)}
                {!slots.length && <p>{t("booking.noSlotsTitle")}</p>}
              </fieldset>
              <label>{t("booking.changeNote")}<textarea name="patientNote" maxLength={500} /></label>
              <button className="booking-primary" disabled={changing || !slots.length}>{t(changing ? "booking.sending" : "booking.submitReschedule")}</button>
              <Feedback state={changeState} t={t} />
            </form>
            <form className="booking-change-panel cancel" action={changeAction}>
              <input type="hidden" name="publicRequestId" value={selected.publicRequestId} />
              <input type="hidden" name="requestType" value="cancel" />
              <input type="hidden" name="scheduledStart" value="" />
              <input type="hidden" name="slotDurationMinutes" value="" />
              <h3>{t("booking.cancelAppointment")}</h3><p>{t("booking.cancelAppointmentHelp")}</p>
              <label>{t("booking.changeNote")}<textarea name="patientNote" maxLength={500} /></label>
              <label className="booking-confirm-check"><input type="checkbox" name="confirmed" value="yes" required />{t("booking.confirmCancellation")}</label>
              <button className="request-decline" disabled={changing}>{t(changing ? "booking.sending" : "booking.submitCancellation")}</button>
              <Feedback state={changeState} t={t} />
            </form>
          </div>}
        </section>}
      </div>}
  </main>;
}
