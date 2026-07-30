import "server-only";

import { getSiteUrl } from "@/lib/site-url";
import { sendMxrouteEmail } from "./mxroute";

type Locale = "en" | "de" | "ro" | "hu";

const copy: Record<Locale, {
  subject: string;
  greeting: string;
  received: string;
  doctor: string;
  clinic: string;
  date: string;
  status: string;
  pending: string;
  manage: string;
  account: string;
  manageButton: string;
  accountButton: string;
}> = {
  en: {
    subject: "We received your VitaPass appointment request",
    greeting: "Hello",
    received: "Your appointment request has been sent to the clinic.",
    doctor: "Doctor",
    clinic: "Clinic",
    date: "Requested time",
    status: "Status",
    pending: "Waiting for Doctor or Staff confirmation",
    manage: "Use this protected link to check the request status.",
    account: "You can also create a VitaPass patient account.",
    manageButton: "View request",
    accountButton: "Create VitaPass account",
  },
  de: {
    subject: "Ihre VitaPass-Terminanfrage ist eingegangen",
    greeting: "Hallo",
    received: "Ihre Terminanfrage wurde an die Praxis gesendet.",
    doctor: "Arzt/Ärztin",
    clinic: "Praxis",
    date: "Gewünschter Termin",
    status: "Status",
    pending: "Wartet auf Bestätigung durch Arzt oder Mitarbeiter",
    manage: "Über diesen geschützten Link können Sie den Status prüfen.",
    account: "Sie können außerdem ein VitaPass-Patientenkonto erstellen.",
    manageButton: "Anfrage anzeigen",
    accountButton: "VitaPass-Konto erstellen",
  },
  ro: {
    subject: "Am primit solicitarea dumneavoastră de programare VitaPass",
    greeting: "Bună ziua",
    received: "Solicitarea de programare a fost trimisă clinicii.",
    doctor: "Medic",
    clinic: "Clinică",
    date: "Ora solicitată",
    status: "Stare",
    pending: "În așteptarea confirmării medicului sau personalului",
    manage: "Folosiți acest link protejat pentru a verifica starea solicitării.",
    account: "De asemenea, puteți crea un cont VitaPass de pacient.",
    manageButton: "Vezi solicitarea",
    accountButton: "Creează cont VitaPass",
  },
  hu: {
    subject: "Megkaptuk VitaPass időpontkérelmét",
    greeting: "Üdvözöljük",
    received: "Az időpontkérelmet elküldtük a rendelőnek.",
    doctor: "Orvos",
    clinic: "Rendelő",
    date: "Kért időpont",
    status: "Állapot",
    pending: "Orvosi vagy munkatársi megerősítésre vár",
    manage: "Ezen a védett hivatkozáson ellenőrizheti a kérelem állapotát.",
    account: "VitaPass betegfiókot is létrehozhat.",
    manageButton: "Kérelem megtekintése",
    accountButton: "VitaPass-fiók létrehozása",
  },
};

const locales: Record<Locale, string> = {
  en: "en-GB", de: "de-DE", ro: "ro-RO", hu: "hu-HU",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}

export async function sendAppointmentRequestEmail(input: {
  to: string;
  patientName: string;
  doctorName: string;
  clinicName: string;
  scheduledStart: string;
  slotDurationMinutes: 15 | 30 | 45;
  locale: Locale;
  managementToken: string;
}) {
  const text = copy[input.locale];
  const siteUrl = getSiteUrl();
  const statusUrl = `${siteUrl}/appointments/status?token=${encodeURIComponent(input.managementToken)}`;
  const accountUrl = `${siteUrl}/register/patient?email=${encodeURIComponent(input.to)}`;
  const formattedDate = new Intl.DateTimeFormat(locales[input.locale], {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Bucharest",
  }).format(new Date(input.scheduledStart));
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17332f;max-width:620px">
    <h1 style="color:#176f63">VitaPass</h1>
    <p>${escapeHtml(text.greeting)} ${escapeHtml(input.patientName)},</p>
    <p>${escapeHtml(text.received)}</p>
    <div style="padding:18px;border:1px solid #dbe6e3;border-radius:10px;background:#f8fbfa">
      <strong>${escapeHtml(text.doctor)}:</strong> ${escapeHtml(input.doctorName)}<br>
      <strong>${escapeHtml(text.clinic)}:</strong> ${escapeHtml(input.clinicName)}<br>
      <strong>${escapeHtml(text.date)}:</strong> ${escapeHtml(formattedDate)} (${input.slotDurationMinutes} min)<br>
      <strong>${escapeHtml(text.status)}:</strong> ${escapeHtml(text.pending)}
    </div>
    <p>${escapeHtml(text.manage)}</p>
    <p><a href="${escapeHtml(statusUrl)}" style="display:inline-block;padding:11px 16px;border-radius:8px;background:#176f63;color:#fff;text-decoration:none;font-weight:bold">${escapeHtml(text.manageButton)}</a></p>
    <p>${escapeHtml(text.account)}</p>
    <p><a href="${escapeHtml(accountUrl)}">${escapeHtml(text.accountButton)}</a></p>
  </div>`;
  return sendMxrouteEmail({ to: input.to, subject: text.subject, html });
}
