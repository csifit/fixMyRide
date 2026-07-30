"use client";

import Link from "next/link";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { PublicDoctor, PublicSlot } from "@/lib/dal/public-appointments";
import PublicBookingHeader from "../PublicBookingHeader";

function dateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function DoctorAvailabilityClient({
  doctor,
  slots,
  selectedDate,
}: {
  doctor: PublicDoctor;
  slots: PublicSlot[];
  selectedDate: string;
}) {
  const [language, , ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  const base = new Date(`${selectedDate}T12:00:00`);
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(base);
    date.setDate(base.getDate() + index);
    return date;
  });
  return <main className="booking-shell">
    <PublicBookingHeader />
    <section className="booking-detail">
      <nav className="booking-breadcrumb"><Link href="/appointments">{ready ? t("booking.searchResults") : "Search results"}</Link><span>›</span><b>{doctor.name}</b></nav>
      <div className="doctor-profile-summary">
        <div className="doctor-result-avatar">{doctor.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</div>
        <div><span className="doctor-verified">✓ {ready ? t("booking.verifiedDoctor") : "Verified Doctor"}</span><h1>{doctor.name}</h1><strong>{doctor.specialty}</strong><p>{doctor.clinicName} · {doctor.clinicCountry}</p></div>
      </div>
      <div className="booking-detail-grid">
        <section className="slot-card">
          <div className="slot-card-head"><div><h2>{ready ? t("booking.chooseTime") : "Choose your appointment time"}</h2><p>{ready ? t("booking.timesLocal") : "Times shown in Europe/Bucharest time"}</p></div><span>{ready ? t("booking.noPayment") : "No payment required"}</span></div>
          <div className="booking-date-strip">
            {dates.map((date) => {
              const value = dateValue(date);
              return <Link className={value === selectedDate ? "active" : ""} href={`/appointments/${doctor.id}?date=${value}`} key={value}>
                <small>{new Intl.DateTimeFormat(language, { weekday: "short" }).format(date)}</small>
                <strong>{date.getDate()}</strong>
                <span>{new Intl.DateTimeFormat(language, { month: "short" }).format(date)}</span>
              </Link>;
            })}
          </div>
          <h3>{new Intl.DateTimeFormat(language, { dateStyle: "full" }).format(base)}</h3>
          <div className="public-slot-grid">
            {slots.map((slot) => <Link key={slot.scheduledStart} href={`/appointments/${doctor.id}/reserve?slot=${encodeURIComponent(slot.scheduledStart)}&duration=${slot.slotDurationMinutes}`}>
              <strong>{new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest" }).format(new Date(slot.scheduledStart))}</strong>
              <small>{slot.slotDurationMinutes} {ready ? t("availability.minutes") : "minutes"}</small>
            </Link>)}
          </div>
          {!slots.length && <div className="booking-empty compact"><h3>{ready ? t("booking.noSlotsTitle") : "No appointments on this date"}</h3><p>{ready ? t("booking.chooseAnotherDate") : "Choose another date above."}</p></div>}
        </section>
        <aside className="booking-reassurance">
          <h3>{ready ? t("booking.whatHappens") : "What happens next?"}</h3>
          <ol><li><b>1</b><span>{ready ? t("booking.stepChoose") : "Choose an available time"}</span></li><li><b>2</b><span>{ready ? t("booking.stepDetails") : "Enter your contact details"}</span></li><li><b>3</b><span>{ready ? t("booking.stepClinicConfirms") : "The clinic confirms your request"}</span></li></ol>
          <p>✓ {ready ? t("booking.smsAfterConfirmation") : "SMS is sent only after confirmation"}</p>
        </aside>
      </div>
    </section>
  </main>;
}
