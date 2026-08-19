import "server-only";

import { brand } from "@/lib/brand";
import { getSiteUrl } from "@/lib/site-url";
import { escapeEmailHtml, sendTransactionalEmail } from "./transactional-email";

type Locale = "en" | "de" | "ro" | "hu";

const copy = {
  en: { subject: "Open your service request", title: "Your private booking link", intro: "Use this secure link to follow your request, answer appointment proposals, and approve or decline repair estimates.", action: "Open service request", expiry: "The link expires after 90 days. Do not forward it because it gives access to this booking." },
  de: { subject: "Serviceanfrage öffnen", title: "Ihr privater Buchungslink", intro: "Über diesen sicheren Link können Sie Ihre Anfrage verfolgen, Terminvorschläge beantworten und Kostenvoranschläge annehmen oder ablehnen.", action: "Serviceanfrage öffnen", expiry: "Der Link läuft nach 90 Tagen ab. Leiten Sie ihn nicht weiter, da er Zugriff auf diese Buchung gewährt." },
  ro: { subject: "Deschide cererea de service", title: "Linkul privat al programării", intro: "Folosește acest link securizat pentru a urmări cererea, a răspunde propunerilor de programare și a aproba sau refuza devizele.", action: "Deschide cererea", expiry: "Linkul expiră după 90 de zile. Nu îl redirecționa, deoarece oferă acces la această programare." },
  hu: { subject: "Szervizkérelem megnyitása", title: "Privát foglalási hivatkozás", intro: "Ezen a biztonságos hivatkozáson követheti a kérelmet, válaszolhat az időpontjavaslatokra, és elfogadhatja vagy elutasíthatja az árajánlatot.", action: "Szervizkérelem megnyitása", expiry: "A hivatkozás 90 nap után lejár. Ne továbbítsa, mert hozzáférést biztosít ehhez a foglaláshoz." },
} as const;

export async function sendBookingAccessEmail(input: {
  to: string;
  customerName: string;
  workshopName: string;
  serviceName: string;
  vehicleRegistration: string;
  token: string;
  locale: Locale;
}) {
  const localized = copy[input.locale];
  const accessUrl = `${getSiteUrl()}/customer/booking-access/activate?token=${encodeURIComponent(input.token)}`;
  const subject = `${localized.subject} · ${input.workshopName}`;
  const text = `${localized.title}\n\n${localized.intro}\n\n${input.serviceName} · ${input.vehicleRegistration}\n${accessUrl}\n\n${localized.expiry}`;
  const html = `<!doctype html><html lang="${input.locale}"><body style="margin:0;background:#f3f7f6;color:#17332f;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" style="max-width:600px;background:#fff;border:1px solid #d5e2df;border-radius:14px"><tr><td style="padding:30px 32px"><strong style="font-size:22px;color:#006e6e;font-weight:400">${escapeEmailHtml(brand.name)}</strong><h1 style="font-size:26px;font-weight:400">${escapeEmailHtml(localized.title)}</h1><p>${escapeEmailHtml(input.customerName)}, ${escapeEmailHtml(localized.intro)}</p><p><strong style="font-weight:400">${escapeEmailHtml(input.serviceName)}</strong><br>${escapeEmailHtml(input.workshopName)} · ${escapeEmailHtml(input.vehicleRegistration)}</p><p><a href="${escapeEmailHtml(accessUrl)}" style="display:inline-block;padding:13px 18px;border-radius:8px;background:#006e6e;color:#fff;text-decoration:none">${escapeEmailHtml(localized.action)}</a></p><p style="color:#5d726d;font-size:13px">${escapeEmailHtml(localized.expiry)}</p></td></tr></table></td></tr></table></body></html>`;
  return sendTransactionalEmail({
    to: input.to, subject, text, html,
    messageType: "booking-access",
  });
}
