import "server-only";

import { brand } from "@/lib/brand";
import { escapeEmailHtml, sendTransactionalEmail } from "@/lib/email/transactional-email";
import { sendSmsLinkMessage } from "@/lib/sms/smslink";
import { createServiceClient } from "@/lib/supabase/service";
import { getSiteUrl } from "@/lib/site-url";
import { sendWhatsAppSessionText, sendWhatsAppTemplate } from "@/lib/whatsapp/cloud-api";
import { bookingCommunicationCopy, type BookingCommunicationMessageInput } from "./booking-communication-message";

type CommunicationRow = BookingCommunicationMessageInput & {
  delivery_id: string;
  booking_id: string;
  channel: "email" | "sms" | "whatsapp";
  destination: string;
  message_mode: "template" | "session_text" | null;
  message_body: string | null;
};

export async function dispatchDueBookingCommunications(bookingId?: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("claim_due_booking_communication_deliveries", {
    requested_limit: bookingId ? 20 : 50,
    requested_booking_id: bookingId ?? null,
  });
  if (error) throw new Error("booking_communication_claim_failed");

  let sent = 0;
  let failed = 0;
  const siteUrl = getSiteUrl();
  for (const row of (data ?? []) as CommunicationRow[]) {
    const content = bookingCommunicationCopy(row);
    const destinationUrl = row.audience === "workshop"
      ? `${siteUrl}/workshop-manager/requests`
      : `${siteUrl}/customer/bookings`;
    const result = row.channel === "sms"
      ? await sendSmsLinkMessage(row.destination, content.sms)
      : row.channel === "whatsapp"
        ? row.message_mode === "session_text" && row.message_body
          ? await sendWhatsAppSessionText({ to: row.destination, body: row.message_body })
          : await sendWhatsAppTemplate({
              to: row.destination,
              locale: row.locale,
              parameters: [
                row.customer_name,
                row.workshop_name,
                row.service_name,
                row.vehicle_registration,
                content.body,
                destinationUrl,
              ],
            })
        : await sendTransactionalEmail({
          to: row.destination,
          subject: content.subject,
          text: `${content.body}\n\nOpen Pitster: ${destinationUrl}`,
          html: `<!doctype html><html><body style="margin:0;background:#f3f7f6;color:#17332f;font-family:Arial,sans-serif"><table role="presentation" width="100%" style="padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" style="max-width:600px;background:#fff;border:1px solid #d5e2df;border-radius:14px"><tr><td style="padding:30px 32px"><strong style="font-size:22px;color:#006e6e;font-weight:400">${escapeEmailHtml(brand.name)}</strong><h1 style="font-size:24px;font-weight:400">${escapeEmailHtml(content.subject)}</h1>${content.body.split("\n").map((line) => `<p>${escapeEmailHtml(line)}</p>`).join("")}<p><a href="${escapeEmailHtml(destinationUrl)}" style="display:inline-block;padding:12px 17px;border-radius:8px;background:#006e6e;color:#fff;text-decoration:none">Open booking</a></p></td></tr></table></td></tr></table></body></html>`,
          messageType: `booking-${row.event_kind}`,
        });
    const { error: completionError } = await supabase.rpc(
      "complete_booking_communication_delivery",
      {
        requested_delivery_id: row.delivery_id,
        delivery_succeeded: result.ok,
        requested_provider_message_id: result.ok ? result.providerMessageId : null,
        requested_error_code: result.ok ? null : result.errorCode,
      },
    );
    if (completionError) throw new Error("booking_communication_completion_failed");
    if (result.ok) sent += 1; else failed += 1;
  }
  return { claimed: (data ?? []).length, sent, failed };
}
