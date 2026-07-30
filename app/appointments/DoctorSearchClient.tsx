"use client";

import Link from "next/link";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { PublicDoctor } from "@/lib/dal/public-appointments";
import PublicBookingHeader from "./PublicBookingHeader";

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export default function DoctorSearchClient({
  doctors,
  query,
  date,
}: {
  doctors: PublicDoctor[];
  query: string;
  date: string;
}) {
  const [language, , ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  return <main className="booking-shell">
    <PublicBookingHeader />
    <section className="booking-hero">
      <div>
        <span>{ready ? t("booking.kicker") : "VitaPass appointments"}</span>
        <h1>{ready ? t("booking.searchTitle") : "Find the right Doctor and request an appointment"}</h1>
        <p>{ready ? t("booking.searchDescription") : "Compare Doctors and choose an available time in a few simple steps."}</p>
      </div>
      <form className="booking-search" method="get">
        <label><span>{ready ? t("booking.searchLabel") : "Doctor, specialty or clinic"}</span>
          <input name="q" defaultValue={query} placeholder={ready ? t("booking.searchPlaceholder") : "e.g. Family medicine"} />
        </label>
        <label><span>{ready ? t("booking.date") : "Preferred date"}</span>
          <input type="date" name="date" defaultValue={date} min={date} />
        </label>
        <button>{ready ? t("booking.search") : "Search"}</button>
      </form>
    </section>
    <section className="booking-results">
      <div className="booking-results-head">
        <div><h2>{ready ? t("booking.availableDoctors") : "Available Doctors"}</h2>
        <p>{doctors.length} {ready ? t("booking.results") : "results"}</p></div>
      </div>
      <div className="doctor-result-list">
        {doctors.map((doctor) => <article className="doctor-result-card" key={doctor.id}>
          <div className="doctor-result-avatar">{initials(doctor.name)}</div>
          <div className="doctor-result-info">
            <span className="doctor-verified">✓ {ready ? t("booking.verifiedDoctor") : "Verified Doctor"}</span>
            <h3>{doctor.name}</h3>
            <strong>{doctor.specialty}</strong>
            <p>{doctor.clinicName} · {doctor.clinicCountry}</p>
            <div className="doctor-features">
              <span>✓ {ready ? t("booking.onlineRequests") : "Online requests"}</span>
              <span>✓ {ready ? t("booking.emailUpdates") : "Email updates"}</span>
            </div>
          </div>
          <div className="doctor-result-action">
            <small>{ready ? t("booking.checkAvailability") : "Check real-time availability"}</small>
            <Link href={`/appointments/${doctor.id}?date=${date}`}>{ready ? t("booking.seeAvailability") : "See availability"}</Link>
          </div>
        </article>)}
        {!doctors.length && <div className="booking-empty"><h3>{ready ? t("booking.noDoctors") : "No Doctors found"}</h3><p>{ready ? t("booking.tryAnotherSearch") : "Try another Doctor, specialty or clinic."}</p></div>}
      </div>
    </section>
  </main>;
}
