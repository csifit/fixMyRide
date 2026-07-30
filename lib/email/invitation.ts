import "server-only";

import type { Language } from "@/app/i18n";
import { sendMxrouteEmail } from "./mxroute";

type InvitationKind = "clinic_doctor" | "doctor_staff";

const copy: Record<
  Language,
  Record<InvitationKind, { subject: string; title: string; message: string; action: string }>
> = {
  en: {
    clinic_doctor: {
      subject: "VitaPass clinic invitation",
      title: "You have been invited to VitaPass",
      message: "A Clinic Manager invited you to register as a doctor linked to their clinic.",
      action: "Accept doctor invitation",
    },
    doctor_staff: {
      subject: "VitaPass Staff invitation",
      title: "You have been invited to VitaPass",
      message: "A doctor invited you to join their appointment-management Staff.",
      action: "Accept Staff invitation",
    },
  },
  de: {
    clinic_doctor: {
      subject: "VitaPass-Klinikeinladung",
      title: "Sie wurden zu VitaPass eingeladen",
      message: "Eine Klinikleitung hat Sie eingeladen, sich als Arzt oder Ärztin ihrer Klinik zu registrieren.",
      action: "Arzteinladung annehmen",
    },
    doctor_staff: {
      subject: "VitaPass-Mitarbeitereinladung",
      title: "Sie wurden zu VitaPass eingeladen",
      message: "Ein Arzt oder eine Ärztin hat Sie zur Terminverwaltung eingeladen.",
      action: "Mitarbeitereinladung annehmen",
    },
  },
  ro: {
    clinic_doctor: {
      subject: "Invitație VitaPass din partea clinicii",
      title: "Ai fost invitat în VitaPass",
      message: "Un Manager de clinică te-a invitat să te înregistrezi ca medic afiliat clinicii.",
      action: "Acceptă invitația de medic",
    },
    doctor_staff: {
      subject: "Invitație VitaPass pentru personal",
      title: "Ai fost invitat în VitaPass",
      message: "Un medic te-a invitat să faci parte din personalul care gestionează programările.",
      action: "Acceptă invitația pentru personal",
    },
  },
  hu: {
    clinic_doctor: {
      subject: "VitaPass klinikai meghívó",
      title: "Meghívást kapott a VitaPass rendszerbe",
      message: "Egy klinikavezető meghívta, hogy a klinikához kapcsolt orvosként regisztráljon.",
      action: "Orvosi meghívó elfogadása",
    },
    doctor_staff: {
      subject: "VitaPass munkatársi meghívó",
      title: "Meghívást kapott a VitaPass rendszerbe",
      message: "Egy orvos meghívta az időpontokat kezelő munkatársai közé.",
      action: "Munkatársi meghívó elfogadása",
    },
  },
};

const footer: Record<Language, string> = {
  en: "This invitation expires in 7 days. If you did not expect it, you can ignore this email.",
  de: "Diese Einladung läuft in 7 Tagen ab. Wenn Sie sie nicht erwartet haben, können Sie diese E-Mail ignorieren.",
  ro: "Această invitație expiră în 7 zile. Dacă nu o așteptai, poți ignora acest e-mail.",
  hu: "A meghívó 7 nap múlva lejár. Ha nem számított rá, hagyja figyelmen kívül ezt az e-mailt.",
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendInvitationEmail({
  to,
  kind,
  language,
  invitationUrl,
}: {
  to: string;
  kind: InvitationKind;
  language: Language;
  invitationUrl: string;
}) {
  const content = copy[language][kind];
  const safeUrl = escapeHtml(invitationUrl);
  return sendMxrouteEmail({
    to,
    subject: content.subject,
    html: `<!doctype html>
<html lang="${language}">
  <body style="margin:0;background:#F4F8F8;color:#17332f;font-family:Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;padding:32px 18px">
      <div style="background:#ffffff;border:1px solid #dce8e5;border-radius:16px;padding:30px">
        <p style="margin:0 0 24px;color:#006E6E;font-size:22px;font-weight:800">VitaPass</p>
        <h1 style="margin:0 0 12px;font-size:24px">${escapeHtml(content.title)}</h1>
        <p style="margin:0 0 24px;line-height:1.6">${escapeHtml(content.message)}</p>
        <p style="margin:0 0 26px">
          <a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#006E6E;color:#ffffff;text-decoration:none;font-weight:700">${escapeHtml(content.action)}</a>
        </p>
        <p style="margin:0;color:#667d78;font-size:13px;line-height:1.5">${escapeHtml(footer[language])}</p>
      </div>
    </div>
  </body>
</html>`,
  });
}
