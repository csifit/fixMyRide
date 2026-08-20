import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type WhatsAppThreadMessage = {
  direction: "inbound" | "outbound";
  body: string;
  occurredAt: string;
  providerStatus: string | null;
};

export type BookingWhatsAppState = {
  optedIn: boolean;
  lastInboundAt: string | null;
  replyWindowEndsAt: string | null;
  replyWindowOpen: boolean;
  messages: WhatsAppThreadMessage[];
};

function mapState(row: Record<string, unknown> | null | undefined): BookingWhatsAppState {
  return {
    optedIn: Boolean(row?.opted_in ?? row?.optedIn),
    lastInboundAt: (row?.last_inbound_at ?? row?.lastInboundAt) as string | null ?? null,
    replyWindowEndsAt: (row?.reply_window_ends_at ?? row?.replyWindowEndsAt) as string | null ?? null,
    replyWindowOpen: Boolean(row?.reply_window_open ?? row?.replyWindowOpen),
    messages: Array.isArray(row?.messages) ? row.messages as WhatsAppThreadMessage[] : [],
  };
}

export async function loadMyBookingWhatsAppStates() {
  const { data, error } = await (await createClient()).rpc("get_my_booking_whatsapp_state");
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  return new Map(((data ?? []) as Record<string, unknown>[]).map((row) => [
    row.booking_id as string, mapState(row),
  ]));
}

export async function loadManagedBookingWhatsAppStates() {
  const { data, error } = await (await createClient()).rpc("get_managed_booking_whatsapp_state");
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  return new Map(((data ?? []) as Record<string, unknown>[]).map((row) => [
    row.booking_id as string, mapState(row),
  ]));
}

export async function loadGuestBookingWhatsAppState(digest: string) {
  const { data, error } = await createServiceClient().rpc(
    "get_booking_whatsapp_state_with_access_token",
    { requested_token_digest: digest },
  );
  if (error) throw new DataAccessError(error.code === "42501" ? "unauthorized" : "unavailable");
  return mapState(data && typeof data === "object" ? data as Record<string, unknown> : null);
}

export async function setMyBookingWhatsAppPreference(bookingId: string, enabled: boolean) {
  const { error } = await (await createClient()).rpc("set_my_booking_whatsapp_preference", {
    requested_booking_id: bookingId, requested_enabled: enabled,
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}

export async function setGuestBookingWhatsAppPreference(digest: string, enabled: boolean) {
  const { data, error } = await createServiceClient().rpc(
    "set_booking_whatsapp_preference_with_access_token",
    { requested_token_digest: digest, requested_enabled: enabled },
  );
  if (error) throw new DataAccessError(error.code === "42501" ? "unauthorized" : "unavailable");
  return data as string;
}

export async function queueManagedWhatsAppReply(bookingId: string, body: string) {
  const { data, error } = await (await createClient()).rpc("queue_managed_booking_whatsapp_reply", {
    requested_booking_id: bookingId, requested_body: body,
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  return data as string;
}

export async function recordWhatsAppInbound(input: {
  providerMessageId: string;
  from: string;
  body: string;
  contextMessageId: string | null;
  occurredAt: string;
}) {
  const { error } = await createServiceClient().rpc("record_whatsapp_inbound_message", {
    requested_provider_message_id: input.providerMessageId,
    requested_from: input.from,
    requested_body: input.body,
    requested_context_message_id: input.contextMessageId,
    requested_occurred_at: input.occurredAt,
  });
  if (error) throw new DataAccessError("unavailable");
}

export async function recordWhatsAppStatus(input: {
  providerMessageId: string;
  status: string;
  occurredAt: string;
  errorCode: string | null;
}) {
  const { error } = await createServiceClient().rpc("record_whatsapp_delivery_status", {
    requested_provider_message_id: input.providerMessageId,
    requested_status: input.status,
    requested_occurred_at: input.occurredAt,
    requested_error_code: input.errorCode,
  });
  if (error) throw new DataAccessError("unavailable");
}
