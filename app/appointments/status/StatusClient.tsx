"use client";

import Link from "next/link";
import { useActionState } from "react";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { PublicSlot } from "@/lib/dal/public-appointments";
import PublicBookingHeader from "../PublicBookingHeader";
import {
  cancelPendingRequestAction,
  requestAppointmentChangeAction,
  type PublicManagementActionState,
} from "./actions";

const idle: PublicManagementActionState = { status: "idle" };

function Feedback({
  state,
  t,
}: {
  state: PublicManagementActionState;
  t: (key: TranslationKey) => string;
}) {
  if (state.status === "idle") return null;
  return <p
    className={state.status === "saved" ? "appointment-success" : "appointment-error"}
    role="status"
  >
    {t(`booking.managementFeedback.${state.status}` as TranslationKey)}
  </p>;
}

export default function StatusClient({ request, token, selectedDate, slots }: {
  request: {
    clinicianId: string;
    doctorName: string;
    specialty: string;
    clinicName: string;
    scheduledStart: string;
    slotDurationMinutes: number;
    status: "pending" | "confirmed" | "declined" | "cancelled" | "completed" | "no_show";
    changeRequest: {
      requestType: "cancel" | "reschedule";
      status: "pending" | "approved" | "declined";
      requestedStart: string | null;
      requestedSlotDurationMinutes: 15 | 30 | 45 | null;
    } | null;
  };
  token: string;
  selectedDate: string;
  slots: PublicSlot[];
}) {
  const [language, , ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  const [cancelState, cancelAction, cancelling] = useActionState(
    cancelPendingRequestAction,
    idle,
  );
  const [changeState, changeAction, changing] = useActionState(
    requestAppointmentChangeAction,
    idle,
  );
  const formattedAppointment = new Intl.DateTimeFormat(language, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Bucharest",
  }).format(new Date(request.scheduledStart));
  const statusIcon = request.status === "confirmed"
    ? "✓"
    : request.status === "pending" ? "…" : "×";

  return <main className="booking-shell"><PublicBookingHeader /><section className="booking-status-page">
    <span className={`booking-status-icon ${request.status}`}>{statusIcon}</span>
    <p className="registration-kicker">{ready ? t("booking.requestStatus") : "Appointment request"}</p>
    <h1>{ready ? t(`booking.status.${request.status}` as TranslationKey) : request.status}</h1>
    <article><h2>{request.doctorName}</h2><p>{request.specialty} · {request.clinicName}</p><strong>{formattedAppointment}</strong><small>{request.slotDurationMinutes} {ready ? t("availability.minutes") : "minutes"}</small></article>
    <p>{ready ? t(`booking.statusHelp.${request.status}` as TranslationKey) : "The clinic will notify you when the status changes."}</p>

    {request.status === "pending" && <form className="booking-change-panel" action={cancelAction}>
      <input type="hidden" name="token" value={token} />
      <h2>{t("booking.cancelRequest")}</h2>
      <p>{t("booking.cancelRequestHelp")}</p>
      <label className="booking-confirm-check">
        <input type="checkbox" name="confirmed" value="yes" required />
        {t("booking.confirmCancellation")}
      </label>
      <button className="request-decline" disabled={cancelling}>
        {t(cancelling ? "booking.sending" : "booking.cancelRequestButton")}
      </button>
      <Feedback state={cancelState} t={t} />
    </form>}

    {request.status === "confirmed" && request.changeRequest?.status === "pending"
      && <section className="booking-change-panel pending">
        <h2>{t("booking.changePending")}</h2>
        <p>{t(`booking.changePending.${request.changeRequest.requestType}` as TranslationKey)}</p>
        {request.changeRequest.requestedStart && <strong>
          {new Intl.DateTimeFormat(language, {
            dateStyle: "full",
            timeStyle: "short",
            timeZone: "Europe/Bucharest",
          }).format(new Date(request.changeRequest.requestedStart))}
        </strong>}
        <small>{t("booking.originalAppointmentRemains")}</small>
      </section>}

    {request.status === "confirmed" && request.changeRequest?.status !== "pending"
      && <section className="booking-management">
        {request.changeRequest && <p className={`booking-change-result ${request.changeRequest.status}`}>
          {t(`booking.changeResult.${request.changeRequest.status}` as TranslationKey)}
        </p>}
        <form className="booking-change-panel" action={changeAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="requestType" value="reschedule" />
          <input type="hidden" name="confirmed" value="yes" />
          <h2>{t("booking.rescheduleAppointment")}</h2>
          <p>{t("booking.rescheduleHelp")}</p>
          <label>{t("booking.date")}
            <input
              type="date"
              value={selectedDate}
              min={new Intl.DateTimeFormat("sv-SE", {
                timeZone: "Europe/Bucharest",
              }).format(new Date())}
              onChange={(event) => {
                window.location.href = `/appointments/status?token=${encodeURIComponent(token)}&date=${event.target.value}`;
              }}
            />
          </label>
          <fieldset className="booking-reschedule-grid">
            <legend>{t("booking.selectNewTime")}</legend>
            {slots.map((slot) => <label key={slot.scheduledStart}>
              <input type="radio" name="scheduledStart" value={slot.scheduledStart} required />
              <span>{new Intl.DateTimeFormat(language, {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Bucharest",
              }).format(new Date(slot.scheduledStart))}</span>
              <input type="hidden" name="slotDurationMinutes" value={slot.slotDurationMinutes} />
            </label>)}
            {!slots.length && <p>{t("booking.noSlotsTitle")}</p>}
          </fieldset>
          <label>{t("booking.changeNote")}
            <textarea name="patientNote" maxLength={500} />
          </label>
          <button className="booking-primary" disabled={changing || !slots.length}>
            {t(changing ? "booking.sending" : "booking.submitReschedule")}
          </button>
          <Feedback state={changeState} t={t} />
        </form>

        <form className="booking-change-panel cancel" action={changeAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="requestType" value="cancel" />
          <input type="hidden" name="scheduledStart" value="" />
          <input type="hidden" name="slotDurationMinutes" value="" />
          <h2>{t("booking.cancelAppointment")}</h2>
          <p>{t("booking.cancelAppointmentHelp")}</p>
          <label>{t("booking.changeNote")}
            <textarea name="patientNote" maxLength={500} />
          </label>
          <label className="booking-confirm-check">
            <input type="checkbox" name="confirmed" value="yes" required />
            {t("booking.confirmCancellation")}
          </label>
          <button className="request-decline" disabled={changing}>
            {t(changing ? "booking.sending" : "booking.submitCancellation")}
          </button>
          <Feedback state={changeState} t={t} />
        </form>
      </section>}

    <Link className="booking-primary" href="/appointments">{ready ? t("booking.findAnother") : "Find another appointment"}</Link>
  </section></main>;
}
