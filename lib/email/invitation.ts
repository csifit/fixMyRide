import "server-only";

import type { Language } from "@/app/i18n";
import { brand } from "@/lib/brand";
import { sendMxrouteEmail } from "./mxroute";

type InvitationKind = "clinic_doctor" | "doctor_staff" | "platform_doctor";

const copy: Record<
  Language,
  Record<InvitationKind, { subject: string; title: string; message: string; action: string }>
> = {
  en: {
    clinic_doctor: {
      subject: "pitster clinic invitation",
      title: "You have been invited to pitster",
      message: "A Clinic Manager invited you to register as a doctor linked to their clinic.",
      action: "Accept doctor invitation",
    },
    doctor_staff: {
      subject: "pitster Staff invitation",
      title: "You have been invited to pitster",
      message: "A doctor invited you to join their appointment-management Staff.",
      action: "Accept Staff invitation",
    },
    platform_doctor: {
      subject: "pitster Doctor invitation",
      title: "You have been invited to pitster",
      message: "A platform administrator invited you to create a Doctor account.",
      action: "Accept Doctor invitation",
    },
  },
  de: {
    clinic_doctor: {
      subject: "pitster-Klinikeinladung",
      title: "Sie wurden zu pitster eingeladen",
      message: "Eine Klinikleitung hat Sie eingeladen, sich als Arzt oder Ärztin ihrer Klinik zu registrieren.",
      action: "Arzteinladung annehmen",
    },
    doctor_staff: {
      subject: "pitster-Mitarbeitereinladung",
      title: "Sie wurden zu pitster eingeladen",
      message: "Ein Arzt oder eine Ärztin hat Sie zur Terminverwaltung eingeladen.",
      action: "Mitarbeitereinladung annehmen",
    },
    platform_doctor: {
      subject: "pitster-Arzteinladung",
      title: "Sie wurden zu pitster eingeladen",
      message: "Ein Plattformadministrator hat Sie eingeladen, ein Arztkonto zu erstellen.",
      action: "Arzteinladung annehmen",
    },
  },
  ro: {
    clinic_doctor: {
      subject: "Invitație pitster din partea clinicii",
      title: "Ai fost invitat în pitster",
      message: "Un Manager de clinică te-a invitat să te înregistrezi ca medic afiliat clinicii.",
      action: "Acceptă invitația de medic",
    },
    doctor_staff: {
      subject: "Invitație pitster pentru personal",
      title: "Ai fost invitat în pitster",
      message: "Un medic te-a invitat să faci parte din personalul care gestionează programările.",
      action: "Acceptă invitația pentru personal",
    },
    platform_doctor: {
      subject: "Invitație pitster pentru medic",
      title: "Ai fost invitat în pitster",
      message: "Un administrator al platformei te-a invitat să creezi un cont de medic.",
      action: "Acceptă invitația de medic",
    },
  },
  hu: {
    clinic_doctor: {
      subject: "pitster klinikai meghívó",
      title: "Meghívást kapott a pitster rendszerbe",
      message: "Egy klinikavezető meghívta, hogy a klinikához kapcsolt orvosként regisztráljon.",
      action: "Orvosi meghívó elfogadása",
    },
    doctor_staff: {
      subject: "pitster munkatársi meghívó",
      title: "Meghívást kapott a pitster rendszerbe",
      message: "Egy orvos meghívta az időpontokat kezelő munkatársai közé.",
      action: "Munkatársi meghívó elfogadása",
    },
    platform_doctor: {
      subject: "pitster orvosi meghívó",
      title: "Meghívást kapott a pitster rendszerbe",
      message: "Egy platformadminisztrátor meghívta egy orvosi fiók létrehozására.",
      action: "Orvosi meghívó elfogadása",
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
  const branded = (value: string) => value.replaceAll("pitster", brand.name);
  return sendMxrouteEmail({
    to,
    subject: branded(content.subject),
    html: `<!doctype html>
<html lang="${language}">
  <body style="margin:0;background:#F4F8F8;color:#17332f;font-family:Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;padding:32px 18px">
      <div style="background:#ffffff;border:1px solid #dce8e5;border-radius:16px;padding:30px">
        <p style="margin:0 0 24px;color:#006E6E;font-size:22px;font-weight:800">${escapeHtml(brand.name)}</p>
        <h1 style="margin:0 0 12px;font-size:24px">${escapeHtml(branded(content.title))}</h1>
        <p style="margin:0 0 24px;line-height:1.6">${escapeHtml(branded(content.message))}</p>
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
