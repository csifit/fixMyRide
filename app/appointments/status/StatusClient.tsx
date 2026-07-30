"use client";

import Link from "next/link";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import PublicBookingHeader from "../PublicBookingHeader";

export default function StatusClient({ request }: {
  request: {
    doctorName: string;
    specialty: string;
    clinicName: string;
    scheduledStart: string;
    slotDurationMinutes: number;
    status: "pending" | "confirmed" | "declined" | "cancelled";
  };
}) {
  const [language, , ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  return <main className="booking-shell"><PublicBookingHeader /><section className="booking-status-page">
    <span className={`booking-status-icon ${request.status}`}>{request.status === "confirmed" ? "✓" : request.status === "pending" ? "…" : "×"}</span>
    <p className="registration-kicker">{ready ? t("booking.requestStatus") : "Appointment request"}</p>
    <h1>{ready ? t(`booking.status.${request.status}` as TranslationKey) : request.status}</h1>
    <article><h2>{request.doctorName}</h2><p>{request.specialty} · {request.clinicName}</p><strong>{new Intl.DateTimeFormat(language, { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Bucharest" }).format(new Date(request.scheduledStart))}</strong><small>{request.slotDurationMinutes} {ready ? t("availability.minutes") : "minutes"}</small></article>
    <p>{ready ? t(`booking.statusHelp.${request.status}` as TranslationKey) : "The clinic will notify you when the status changes."}</p>
    <Link className="booking-primary" href="/appointments">{ready ? t("booking.findAnother") : "Find another appointment"}</Link>
  </section></main>;
}
