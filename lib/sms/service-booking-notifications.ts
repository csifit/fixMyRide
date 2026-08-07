import "server-only";

import { createServiceClient } from "../supabase/service";
import { sendSmsLinkMessage } from "./smslink";
import {
  serviceBookingMessage,
  type ServiceBookingMessageInput,
  type ServiceBookingNotificationKind,
} from "./service-booking-message";

type NotificationRow = ServiceBookingMessageInput & {
  notification_id: string;
  booking_id: string;
  notification_kind: ServiceBookingNotificationKind;
  destination_phone: string;
  customer_name: string;
  service_name: string;
};

export async function dispatchDueServiceBookingNotifications(bookingId?: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc(
    "claim_due_service_booking_notifications",
    {
      requested_limit: bookingId ? 5 : 20,
      requested_booking_id: bookingId ?? null,
    },
  );
  if (error) throw new Error("service_booking_notification_claim_failed");

  let sent = 0;
  let failed = 0;
  for (const row of (data ?? []) as NotificationRow[]) {
    const result = await sendSmsLinkMessage(
      row.destination_phone,
      serviceBookingMessage(row),
    );
    const { error: completionError } = await supabase.rpc(
      "complete_service_booking_notification",
      {
        requested_notification_id: row.notification_id,
        delivery_succeeded: result.ok,
        requested_provider_message_id: result.ok ? result.providerMessageId : null,
        requested_error_code: result.ok ? null : result.errorCode,
      },
    );
    if (completionError) throw new Error("service_booking_notification_completion_failed");
    if (result.ok) sent += 1;
    else failed += 1;
  }
  return { claimed: (data ?? []).length, sent, failed };
}
