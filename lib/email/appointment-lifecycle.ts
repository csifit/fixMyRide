import "server-only";

import { getSiteUrl } from "@/lib/site-url";
import { sendMxrouteEmail } from "./mxroute";

type Locale = "en" | "de" | "ro" | "hu";

const locales: Record<Locale, string> = {
  en: "en-GB", de: "de-DE", ro: "ro-RO", hu: "hu-HU",
};

const copy: Record<Locale, {
  confirmedSubject: string;
  declinedSubject: string;
  approvedSubject: string;
  changeDeclinedSubject: string;
  greeting: string;
  confirmed: string;
  declined: string;
  cancelApproved: string;
  rescheduleApproved: string;
  cancelDeclined: string;
  rescheduleDeclined: string;
  doctor: string;
  clinic: string;
  date: string;
  originalDate: string;
  account: string;
  rebook: string;
  statusHint: string;
}> = {
  en: {
    confirmedSubject: "Your VitaPass appointment is confirmed",
    declinedSubject: "Update about your VitaPass appointment request",
    approvedSubject: "Your VitaPass appointment change was approved",
    changeDeclinedSubject: "Update about your VitaPass appointment change",
    greeting: "Hello",
    confirmed: "The clinic confirmed your appointment.",
    declined: "The clinic could not accept the requested appointment time.",
    cancelApproved: "Your cancellation request was approved. The appointment is cancelled.",
    rescheduleApproved: "Your rescheduling request was approved. Your new appointment is:",
    cancelDeclined: "The clinic could not approve your cancellation request. The original appointment remains confirmed.",
    rescheduleDeclined: "The clinic could not approve your rescheduling request. The original appointment remains confirmed.",
    doctor: "Doctor", clinic: "Clinic", date: "Date and time",
    originalDate: "Original appointment",
    account: "Create VitaPass account",
    rebook: "Find another appointment",
    statusHint: "You can also use the protected status link from your original request email.",
  },
  de: {
    confirmedSubject: "Ihr VitaPass-Termin ist bestätigt",
    declinedSubject: "Aktualisierung Ihrer VitaPass-Terminanfrage",
    approvedSubject: "Ihre VitaPass-Terminänderung wurde genehmigt",
    changeDeclinedSubject: "Aktualisierung Ihrer VitaPass-Terminänderung",
    greeting: "Hallo",
    confirmed: "Die Praxis hat Ihren Termin bestätigt.",
    declined: "Die Praxis konnte den gewünschten Termin nicht annehmen.",
    cancelApproved: "Ihre Stornierungsanfrage wurde genehmigt. Der Termin ist storniert.",
    rescheduleApproved: "Ihre Terminverschiebung wurde genehmigt. Ihr neuer Termin:",
    cancelDeclined: "Die Praxis konnte die Stornierung nicht genehmigen. Der ursprüngliche Termin bleibt bestätigt.",
    rescheduleDeclined: "Die Praxis konnte die Verschiebung nicht genehmigen. Der ursprüngliche Termin bleibt bestätigt.",
    doctor: "Arzt/Ärztin", clinic: "Praxis", date: "Datum und Uhrzeit",
    originalDate: "Ursprünglicher Termin",
    account: "VitaPass-Konto erstellen",
    rebook: "Anderen Termin finden",
    statusHint: "Sie können auch den geschützten Statuslink aus der ursprünglichen E-Mail verwenden.",
  },
  ro: {
    confirmedSubject: "Programarea VitaPass este confirmată",
    declinedSubject: "Actualizare privind solicitarea de programare VitaPass",
    approvedSubject: "Modificarea programării VitaPass a fost aprobată",
    changeDeclinedSubject: "Actualizare privind modificarea programării VitaPass",
    greeting: "Bună ziua",
    confirmed: "Clinica a confirmat programarea.",
    declined: "Clinica nu a putut accepta ora solicitată.",
    cancelApproved: "Solicitarea de anulare a fost aprobată. Programarea este anulată.",
    rescheduleApproved: "Solicitarea de reprogramare a fost aprobată. Noua programare este:",
    cancelDeclined: "Clinica nu a putut aproba anularea. Programarea inițială rămâne confirmată.",
    rescheduleDeclined: "Clinica nu a putut aproba reprogramarea. Programarea inițială rămâne confirmată.",
    doctor: "Medic", clinic: "Clinică", date: "Data și ora",
    originalDate: "Programarea inițială",
    account: "Creează cont VitaPass",
    rebook: "Găsește altă programare",
    statusHint: "Puteți folosi și linkul protejat din e-mailul solicitării inițiale.",
  },
  hu: {
    confirmedSubject: "VitaPass időpontja megerősítve",
    declinedSubject: "VitaPass időpontkérelem frissítése",
    approvedSubject: "VitaPass időpontmódosítása jóváhagyva",
    changeDeclinedSubject: "VitaPass időpontmódosítás frissítése",
    greeting: "Üdvözöljük",
    confirmed: "A rendelő megerősítette az időpontot.",
    declined: "A rendelő nem tudta elfogadni a kért időpontot.",
    cancelApproved: "A lemondási kérelmet jóváhagyták. Az időpont törölve.",
    rescheduleApproved: "Az átütemezési kérelmet jóváhagyták. Az új időpont:",
    cancelDeclined: "A rendelő nem tudta jóváhagyni a lemondást. Az eredeti időpont továbbra is érvényes.",
    rescheduleDeclined: "A rendelő nem tudta jóváhagyni az átütemezést. Az eredeti időpont továbbra is érvényes.",
    doctor: "Orvos", clinic: "Rendelő", date: "Dátum és idő",
    originalDate: "Eredeti időpont",
    account: "VitaPass-fiók létrehozása",
    rebook: "Másik időpont keresése",
    statusHint: "Az eredeti kérelem e-mailjében található védett állapothivatkozást is használhatja.",
  },
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}

function date(locale: Locale, value: string) {
  return new Intl.DateTimeFormat(locales[locale], {
    dateStyle: "full", timeStyle: "short", timeZone: "Europe/Bucharest",
  }).format(new Date(value));
}

function frame(content: string) {
  return `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17332f;max-width:620px">
    <h1 style="color:#006E6E">VitaPass</h1>${content}</div>`;
}

export async function sendAppointmentDecisionEmail(input: {
  to: string;
  patientName: string;
  doctorName: string;
  clinicName: string;
  scheduledStart: string;
  slotDurationMinutes: number;
  locale: Locale;
  decision: "confirmed" | "declined";
}) {
  const text = copy[input.locale];
  const confirmed = input.decision === "confirmed";
  const actionUrl = confirmed
    ? `${getSiteUrl()}/register/patient?email=${encodeURIComponent(input.to)}`
    : `${getSiteUrl()}/appointments`;
  const html = frame(`
    <p>${escapeHtml(text.greeting)} ${escapeHtml(input.patientName)},</p>
    <p>${escapeHtml(confirmed ? text.confirmed : text.declined)}</p>
    <div style="padding:18px;border:1px solid #dbe6e3;border-radius:10px;background:#f8fbfa">
      <strong>${escapeHtml(text.doctor)}:</strong> ${escapeHtml(input.doctorName)}<br>
      <strong>${escapeHtml(text.clinic)}:</strong> ${escapeHtml(input.clinicName)}<br>
      <strong>${escapeHtml(text.date)}:</strong> ${escapeHtml(date(input.locale, input.scheduledStart))} (${input.slotDurationMinutes} min)
    </div>
    <p>${escapeHtml(text.statusHint)}</p>
    <p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:11px 16px;border-radius:8px;background:#006E6E;color:#fff;text-decoration:none;font-weight:bold">${escapeHtml(confirmed ? text.account : text.rebook)}</a></p>`);
  return sendMxrouteEmail({
    to: input.to,
    subject: confirmed ? text.confirmedSubject : text.declinedSubject,
    html,
  });
}

export async function sendAppointmentChangeDecisionEmail(input: {
  to: string;
  patientName: string;
  doctorName: string;
  clinicName: string;
  currentStart: string;
  requestedStart: string | null;
  requestedSlotDurationMinutes: number | null;
  locale: Locale;
  requestType: "cancel" | "reschedule";
  decision: "approved" | "declined";
}) {
  const text = copy[input.locale];
  const approved = input.decision === "approved";
  const message = input.requestType === "cancel"
    ? approved ? text.cancelApproved : text.cancelDeclined
    : approved ? text.rescheduleApproved : text.rescheduleDeclined;
  const effectiveStart = approved && input.requestType === "reschedule"
    ? input.requestedStart ?? input.currentStart
    : input.currentStart;
  const html = frame(`
    <p>${escapeHtml(text.greeting)} ${escapeHtml(input.patientName)},</p>
    <p>${escapeHtml(message)}</p>
    <div style="padding:18px;border:1px solid #dbe6e3;border-radius:10px;background:#f8fbfa">
      <strong>${escapeHtml(text.doctor)}:</strong> ${escapeHtml(input.doctorName)}<br>
      <strong>${escapeHtml(text.clinic)}:</strong> ${escapeHtml(input.clinicName)}<br>
      <strong>${escapeHtml(
        approved && input.requestType === "reschedule" ? text.date : text.originalDate
      )}:</strong> ${escapeHtml(date(input.locale, effectiveStart))}
      ${input.requestedSlotDurationMinutes ? ` (${input.requestedSlotDurationMinutes} min)` : ""}
    </div>
    <p>${escapeHtml(text.statusHint)}</p>`);
  return sendMxrouteEmail({
    to: input.to,
    subject: approved ? text.approvedSubject : text.changeDeclinedSubject,
    html,
  });
}
