import "server-only";

import { getSiteUrl } from "@/lib/site-url";
import { sendMxrouteEmail } from "./mxroute";

type Locale = "en" | "de" | "ro" | "hu";

const copy: Record<Locale, {
  subject: string;
  greeting: string;
  intro: string;
  doctor: string;
  date: string;
  status: string;
  register: string;
  button: string;
}> = {
  en: {
    subject: "Your pitster appointment",
    greeting: "Hello",
    intro: "Your appointment details are:",
    doctor: "Doctor",
    date: "Date and time",
    status: "Status",
    register: "Create a pitster patient account to keep your medical profile and appointments in one place.",
    button: "Create pitster account",
  },
  de: {
    subject: "Ihr pitster-Termin",
    greeting: "Hallo",
    intro: "Ihre Termindaten:",
    doctor: "Arzt/Ärztin",
    date: "Datum und Uhrzeit",
    status: "Status",
    register: "Erstellen Sie ein pitster-Patientenkonto, um Ihr medizinisches Profil und Ihre Termine an einem Ort zu verwalten.",
    button: "pitster-Konto erstellen",
  },
  ro: {
    subject: "Programarea dumneavoastră pitster",
    greeting: "Bună ziua",
    intro: "Detaliile programării sunt:",
    doctor: "Medic",
    date: "Data și ora",
    status: "Stare",
    register: "Creați un cont pitster de pacient pentru a păstra profilul medical și programările într-un singur loc.",
    button: "Creează cont pitster",
  },
  hu: {
    subject: "pitster időpontja",
    greeting: "Üdvözöljük",
    intro: "Az időpont adatai:",
    doctor: "Orvos",
    date: "Dátum és idő",
    status: "Állapot",
    register: "Hozzon létre pitster betegfiókot, hogy egészségügyi profilját és időpontjait egy helyen kezelhesse.",
    button: "pitster-fiók létrehozása",
  },
};

const localeNames: Record<Locale, string> = {
  en: "en-GB",
  de: "de-DE",
  ro: "ro-RO",
  hu: "hu-HU",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

export async function sendAppointmentCreatedEmail(input: {
  to: string;
  patientName: string;
  doctorName: string;
  scheduledStart: string;
  slotDurationMinutes: 15 | 30 | 45;
  status: "pending" | "confirmed";
  locale: Locale;
}) {
  const text = copy[input.locale];
  const registrationUrl = `${getSiteUrl()}/register/patient?email=${encodeURIComponent(input.to)}`;
  const formattedDate = new Intl.DateTimeFormat(localeNames[input.locale], {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Bucharest",
  }).format(new Date(input.scheduledStart));
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#17332f;max-width:600px">
      <h1 style="color:#006E6E">pitster</h1>
      <p>${escapeHtml(text.greeting)} ${escapeHtml(input.patientName)},</p>
      <p>${escapeHtml(text.intro)}</p>
      <p><strong>${escapeHtml(text.doctor)}:</strong> ${escapeHtml(input.doctorName)}<br>
      <strong>${escapeHtml(text.date)}:</strong> ${escapeHtml(formattedDate)} (${input.slotDurationMinutes} min)<br>
      <strong>${escapeHtml(text.status)}:</strong> ${escapeHtml(input.status)}</p>
      <p>${escapeHtml(text.register)}</p>
      <p><a href="${escapeHtml(registrationUrl)}" style="display:inline-block;padding:11px 16px;border-radius:8px;background:#006E6E;color:#fff;text-decoration:none;font-weight:bold">${escapeHtml(text.button)}</a></p>
    </div>`;
  return sendMxrouteEmail({
    to: input.to,
    subject: text.subject,
    html,
  });
}
