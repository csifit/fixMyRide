"use client";

import Link from "next/link";
import { clinicianSpecialtyKey } from "@/app/i18n/admin-values";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import PublicBookingHeader from "@/app/appointments/PublicBookingHeader";
import type { PublicDoctor } from "@/lib/dal/public-appointments";

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export default function DoctorPublicProfile({ doctor, date }: { doctor: PublicDoctor; date: string }) {
  const [language, , ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  const specialtyKey = clinicianSpecialtyKey(doctor.specialty);
  const specialty = specialtyKey === "admin.value.unknown" ? doctor.specialty : t(specialtyKey);
  return <main className="booking-shell doctor-public-page">
    <PublicBookingHeader />
    <section className="doctor-public-hero">
      <div className="doctor-public-avatar">{initials(doctor.name)}</div>
      <div>
        <span className="doctor-verified">✓ {ready ? t("booking.verifiedDoctor") : "Verified Doctor"}</span>
        <h1>{doctor.name}</h1>
        <strong>{specialty}</strong>
        <p>{doctor.clinicName} · {doctor.city || doctor.clinicCountry}</p>
        <div className="home-rating"><span>★★★★★</span> (0)</div>
      </div>
      <aside>
        <small>{ready ? t("doctorProfile.appointmentHint") : "Choose a suitable time online"}</small>
        <Link href={`/appointments/${doctor.id}?date=${date}`}>{ready ? t("doctorProfile.book") : "Check availability"}</Link>
      </aside>
    </section>
    <section className="doctor-public-content">
      <article>
        <h2>{ready ? t("doctorProfile.about") : "About"}</h2>
        <p>{doctor.professionalBio || (ready ? t("doctorProfile.aboutEmpty") : "Professional information will be added soon.")}</p>
      </article>
      <article>
        <h2>{ready ? t("doctorProfile.practice") : "Practice information"}</h2>
        <dl>
          <div><dt>{ready ? t("doctorProfile.clinic") : "Clinic"}</dt><dd>{doctor.clinicName}</dd></div>
          <div><dt>{ready ? t("doctorProfile.address") : "Address"}</dt><dd>{[doctor.practiceAddress, doctor.city, doctor.clinicCountry].filter(Boolean).join(", ")}</dd></div>
          {doctor.publicPhone && <div><dt>{ready ? t("doctorProfile.phone") : "Phone"}</dt><dd><a href={`tel:${doctor.publicPhone}`}>{doctor.publicPhone}</a></dd></div>}
          {doctor.publicEmail && <div><dt>{ready ? t("doctorProfile.email") : "Email"}</dt><dd><a href={`mailto:${doctor.publicEmail}`}>{doctor.publicEmail}</a></dd></div>}
          {doctor.yearsExperience !== null && <div><dt>{ready ? t("doctorProfile.experience") : "Experience"}</dt><dd>{doctor.yearsExperience} {ready ? t("doctorProfile.years") : "years"}</dd></div>}
          {!!doctor.spokenLanguages.length && <div><dt>{ready ? t("doctorProfile.languages") : "Languages"}</dt><dd>{doctor.spokenLanguages.join(", ")}</dd></div>}
        </dl>
      </article>
    </section>
  </main>;
}
