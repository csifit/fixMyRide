"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { PublicDoctor, PublicSlot } from "@/lib/dal/public-appointments";
import PublicBookingHeader from "../../PublicBookingHeader";
import { requestPublicAppointmentAction, type PublicBookingState } from "../../public-actions";

const idle: PublicBookingState = { status: "idle" };

export default function ReserveFlow({
  doctor,
  slot,
}: {
  doctor: PublicDoctor;
  slot: PublicSlot;
}) {
  const [language, , ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  const [step, setStep] = useState<1 | 2>(1);
  const [state, action, pending] = useActionState(requestPublicAppointmentAction, idle);
  const [details, setDetails] = useState({
    patientName: "", patientEmail: "", patientPhone: "", patientNote: "",
  });
  const formattedDate = new Intl.DateTimeFormat(language, {
    dateStyle: "full", timeStyle: "short", timeZone: "Europe/Bucharest",
  }).format(new Date(slot.scheduledStart));

  if (state.status === "success" || state.status === "success_email_pending") {
    return <main className="booking-shell"><PublicBookingHeader /><section className="booking-complete">
      <span className="booking-complete-mark">✓</span>
      <p className="registration-kicker">{ready ? t("booking.requestSent") : "Request sent"}</p>
      <h1>{ready ? t("booking.requestReceived") : "Your appointment request was received"}</h1>
      <p>{ready ? t("booking.waitForConfirmation") : "The Doctor or assigned Staff will confirm it. You will receive an SMS only after confirmation."}</p>
      <article><strong>{doctor.name}</strong><span>{doctor.specialty}</span><b>{formattedDate}</b><small>{doctor.clinicName}</small></article>
      {state.status === "success_email_pending" && <p className="booking-warning">{ready ? t("booking.emailPending") : "The request was saved, but the email could not be sent."}</p>}
      <div><Link className="booking-primary" href={`/appointments/status?token=${encodeURIComponent(state.managementToken ?? "")}`}>{ready ? t("booking.viewRequest") : "View request"}</Link>
      <Link href={`/register/patient?email=${encodeURIComponent(details.patientEmail)}`}>{ready ? t("booking.createAccount") : "Create VitaPass account"}</Link></div>
    </section></main>;
  }

  return <main className="booking-shell">
    <PublicBookingHeader />
    <section className="booking-checkout">
      <div className="booking-progress">
        <span className="done"><b>1</b>{ready ? t("booking.progressTime") : "Appointment"}</span>
        <i />
        <span className={step >= 1 ? "active" : ""}><b>2</b>{ready ? t("booking.progressDetails") : "Your details"}</span>
        <i />
        <span className={step === 2 ? "active" : ""}><b>3</b>{ready ? t("booking.progressReview") : "Review"}</span>
      </div>
      <div className="booking-checkout-grid">
        <section className="booking-checkout-main">
          {step === 1 ? <>
            <p className="registration-kicker">{ready ? t("booking.almostDone") : "Almost done"}</p>
            <h1>{ready ? t("booking.yourDetails") : "Enter your details"}</h1>
            <p>{ready ? t("booking.detailsHelp") : "The clinic will use these details only for this appointment request."}</p>
            <div className="booking-details-form">
              <label>{ready ? t("appointments.patientName") : "Patient name"}<input value={details.patientName} onChange={(event) => setDetails({ ...details, patientName: event.target.value })} autoComplete="name" required /></label>
              <label>{ready ? t("appointments.patientEmail") : "Email"}<input type="email" value={details.patientEmail} onChange={(event) => setDetails({ ...details, patientEmail: event.target.value })} autoComplete="email" required /></label>
              <label>{ready ? t("appointments.patientPhone") : "Mobile number"}<input value={details.patientPhone} onChange={(event) => setDetails({ ...details, patientPhone: event.target.value })} placeholder="07xxxxxxxx" autoComplete="tel" required /></label>
              <label>{ready ? t("booking.optionalNote") : "Optional note for the clinic"}<textarea value={details.patientNote} onChange={(event) => setDetails({ ...details, patientNote: event.target.value })} maxLength={500} /></label>
              <button onClick={() => setStep(2)} disabled={details.patientName.trim().length < 2 || !details.patientEmail.includes("@") || details.patientPhone.length < 9}>{ready ? t("booking.continueReview") : "Continue to review"}</button>
            </div>
          </> : <>
            <p className="registration-kicker">{ready ? t("booking.reviewKicker") : "Review request"}</p>
            <h1>{ready ? t("booking.reviewTitle") : "Check everything before requesting"}</h1>
            <div className="booking-review">
              <div><span>{ready ? t("appointments.patientName") : "Patient"}</span><strong>{details.patientName}</strong></div>
              <div><span>{ready ? t("appointments.patientEmail") : "Email"}</span><strong>{details.patientEmail}</strong></div>
              <div><span>{ready ? t("appointments.patientPhone") : "Telephone"}</span><strong>{details.patientPhone}</strong></div>
              <div><span>{ready ? t("booking.appointment") : "Appointment"}</span><strong>{formattedDate}</strong></div>
            </div>
            <form action={action} className="booking-submit-form">
              <input type="hidden" name="clinicianId" value={doctor.id} />
              <input type="hidden" name="scheduledStart" value={slot.scheduledStart} />
              <input type="hidden" name="slotDurationMinutes" value={slot.slotDurationMinutes} />
              <input type="hidden" name="patientName" value={details.patientName} />
              <input type="hidden" name="patientEmail" value={details.patientEmail} />
              <input type="hidden" name="patientPhone" value={details.patientPhone} />
              <input type="hidden" name="patientNote" value={details.patientNote} />
              <input type="hidden" name="locale" value={language} />
              <label className="booking-consent"><input type="checkbox" name="privacyAccepted" value="yes" required /><span>{ready ? t("booking.consent") : "I agree that the clinic may use these details to manage this appointment request."}</span></label>
              {state.status !== "idle" && <p className="appointment-error">{t(`booking.feedback.${state.status}` as TranslationKey)}</p>}
              <div><button type="button" className="booking-secondary" onClick={() => setStep(1)}>{ready ? t("booking.back") : "Back"}</button><button disabled={pending}>{ready ? t(pending ? "booking.sending" : "booking.sendRequest") : "Request appointment"}</button></div>
            </form>
          </>}
        </section>
        <aside className="booking-summary-card">
          <span>{ready ? t("booking.yourSelection") : "Your selection"}</span>
          <h2>{doctor.name}</h2><p>{doctor.specialty}</p>
          <hr /><strong>{formattedDate}</strong><small>{slot.slotDurationMinutes} {ready ? t("availability.minutes") : "minutes"}</small>
          <hr /><p>{doctor.clinicName}<br />{doctor.clinicCountry}</p>
          <b>✓ {ready ? t("booking.noCharge") : "No charge for requesting"}</b>
          <Link href={`/appointments/${doctor.id}?date=${slot.scheduledStart.slice(0, 10)}`}>{ready ? t("booking.changeTime") : "Change time"}</Link>
        </aside>
      </div>
    </section>
  </main>;
}
