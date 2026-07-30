import "server-only";

import { createServiceClient } from "../supabase/service";
import { sendSmsLinkMessage } from "./smslink";

type NotificationRow = {
  notification_id: string;
  appointment_id: string;
  notification_kind: "confirmation" | "reminder_24h";
  destination_phone: string;
  locale: "en" | "de" | "ro" | "hu";
  patient_name: string;
  doctor_name: string;
  scheduled_start: string;
  timezone: string;
};

const languageTags = {
  en: "en-GB",
  de: "de-DE",
  ro: "ro-RO",
  hu: "hu-HU",
} as const;

function messageFor(row: NotificationRow) {
  const date = new Intl.DateTimeFormat(languageTags[row.locale], {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: row.timezone,
  }).format(new Date(row.scheduled_start));
  const doctor = row.doctor_name.slice(0, 55);
  const messages = {
    en: row.notification_kind === "confirmation"
      ? `VitaPass: Your appointment with ${doctor} is confirmed for ${date}.`
      : `VitaPass reminder: Your appointment with ${doctor} is tomorrow at ${date}.`,
    de: row.notification_kind === "confirmation"
      ? `VitaPass: Ihr Termin bei ${doctor} ist fuer ${date} bestaetigt.`
      : `VitaPass Erinnerung: Ihr Termin bei ${doctor} ist morgen, ${date}.`,
    ro: row.notification_kind === "confirmation"
      ? `VitaPass: Programarea la ${doctor} este confirmata pentru ${date}.`
      : `VitaPass: Va reamintim programarea de maine la ${doctor}, ${date}.`,
    hu: row.notification_kind === "confirmation"
      ? `VitaPass: Idopontja ${doctor} orvosnal megerositve: ${date}.`
      : `VitaPass emlekezteto: holnap idopontja van ${doctor} orvosnal: ${date}.`,
  };
  return messages[row.locale].slice(0, 3200);
}

export async function dispatchDueAppointmentNotifications(
  appointmentId?: string,
) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc(
    "claim_due_appointment_notifications",
    {
      requested_limit: appointmentId ? 2 : 20,
      requested_appointment_id: appointmentId ?? null,
    },
  );
  if (error) throw new Error("notification_claim_failed");

  let sent = 0;
  let failed = 0;
  for (const row of (data ?? []) as NotificationRow[]) {
    const result = await sendSmsLinkMessage(
      row.destination_phone,
      messageFor(row),
    );
    const { error: completionError } = await supabase.rpc(
      "complete_appointment_notification",
      {
        requested_notification_id: row.notification_id,
        delivery_succeeded: result.ok,
        requested_provider_message_id:
          result.ok ? result.providerMessageId : null,
        requested_error_code: result.ok ? null : result.errorCode,
      },
    );
    if (completionError) throw new Error("notification_completion_failed");
    if (result.ok) sent += 1;
    else failed += 1;
  }
  return { claimed: (data ?? []).length, sent, failed };
}
