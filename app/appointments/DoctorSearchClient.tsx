"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { translate, type TranslationKey } from "@/app/i18n";
import { clinicianSpecialtyKey } from "@/app/i18n/admin-values";
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
  const [search, setSearch] = useState(query);
  const [specialty, setSpecialty] = useState("");
  const [location, setLocation] = useState("");
  const [preferredDate, setPreferredDate] = useState(date);
  const specialtyName = (value: string) => {
    const key = clinicianSpecialtyKey(value);
    return key === "admin.value.unknown" ? value : t(key);
  };
  const specialties = useMemo(
    () => [...new Set(doctors.map((doctor) => doctor.specialty))].sort(),
    [doctors],
  );
  const locations = useMemo(
    () => [...new Set(doctors.map((doctor) => doctor.city || doctor.clinicCountry))].sort(),
    [doctors],
  );
  const filteredDoctors = doctors.filter((doctor) => {
    const haystack = `${doctor.name} ${doctor.specialty} ${specialtyName(doctor.specialty)} ${doctor.clinicName} ${doctor.city ?? ""} ${doctor.practiceAddress ?? ""} ${doctor.clinicCountry}`.toLocaleLowerCase(language);
    return (!search.trim() || haystack.includes(search.trim().toLocaleLowerCase(language)))
      && (!specialty || doctor.specialty === specialty)
      && (!location || (doctor.city || doctor.clinicCountry) === location);
  });
  return <main className="booking-shell">
    <PublicBookingHeader />
    <section className="booking-hero">
      <div>
        <span>{ready ? t("booking.kicker") : "VitaPass appointments"}</span>
        <h1>{ready ? t("booking.searchTitle") : "Find the right Doctor and request an appointment"}</h1>
        <p>{ready ? t("booking.searchDescription") : "Compare Doctors and choose an available time in a few simple steps."}</p>
      </div>
      <form className="booking-directory-search" onSubmit={(event) => event.preventDefault()}>
        <label><span>{ready ? t("booking.searchLabel") : "Doctor, specialty or clinic"}</span>
          <input name="q" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ready ? t("home.searchPlaceholder") : "Name, clinic or address"} />
        </label>
        <div>
          <label><span>{ready ? t("home.specialtyLabel") : "Specialty"}</span>
            <select value={specialty} onChange={(event) => setSpecialty(event.target.value)}>
              <option value="">{ready ? t("home.allSpecialties") : "All specialties"}</option>
              {specialties.map((item) => <option key={item} value={item}>{specialtyName(item)}</option>)}
            </select>
          </label>
          <label><span>{ready ? t("home.locationLabel") : "Location"}</span>
            <select value={location} onChange={(event) => setLocation(event.target.value)}>
              <option value="">{ready ? t("home.allLocations") : "All locations"}</option>
              {locations.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <label><span>{ready ? t("booking.date") : "Preferred date"}</span>
          <input type="date" name="date" value={preferredDate} min={date} onChange={(event) => setPreferredDate(event.target.value)} />
        </label>
        <div className="booking-directory-search-footer">
          <span><strong>{filteredDoctors.length}</strong> {ready ? t("home.matches") : "matching Doctors"}</span>
          <a href="#doctor-results">{ready ? t("home.showDoctors") : "Show Doctors"}</a>
        </div>
      </form>
    </section>
    <section className="booking-results" id="doctor-results">
      <div className="booking-results-head">
        <div><h2>{ready ? t("booking.availableDoctors") : "Available Doctors"}</h2>
        <p>{filteredDoctors.length} {ready ? t("booking.results") : "results"}</p></div>
      </div>
      <div className="doctor-result-list">
        {filteredDoctors.map((doctor) => <article className="doctor-result-card" key={doctor.id}>
          <div className="doctor-result-avatar">{initials(doctor.name)}</div>
          <div className="doctor-result-info">
            <span className="doctor-verified">✓ {ready ? t("booking.verifiedDoctor") : "Verified Doctor"}</span>
            <h3>{doctor.name}</h3>
            <strong>{specialtyName(doctor.specialty)}</strong>
            <p>{doctor.clinicName} · {doctor.city || doctor.clinicCountry}</p>
            <div className="doctor-features">
              <span>✓ {ready ? t("booking.onlineRequests") : "Online requests"}</span>
              <span>✓ {ready ? t("booking.emailUpdates") : "Email updates"}</span>
            </div>
          </div>
          <div className="doctor-result-action">
            <small>{ready ? t("booking.checkAvailability") : "Check real-time availability"}</small>
            <Link href={`/doctors/${doctor.id}?date=${preferredDate}`}>{ready ? t("home.viewDoctor") : "View Doctor"}</Link>
          </div>
        </article>)}
        {!filteredDoctors.length && <div className="booking-empty"><h3>{ready ? t("booking.noDoctors") : "No Doctors found"}</h3><p>{ready ? t("booking.tryAnotherSearch") : "Try another Doctor, specialty or clinic."}</p></div>}
      </div>
    </section>
  </main>;
}
