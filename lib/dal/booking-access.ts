import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { DataAccessError } from "./errors";
import { loadGuestBookingWhatsAppState, type BookingWhatsAppState } from "./whatsapp";

export type GuestBookingAccess = {
  id: string;
  status: string;
  workshopName: string;
  workshopPhone: string | null;
  workshopEmail: string | null;
  serviceName: string;
  serviceCategory: string;
  vehicleRegistration: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  preferredStart: string;
  alternateStart: string | null;
  confirmedStart: string | null;
  proposedStart: string | null;
  proposalNote: string | null;
  customerNote: string | null;
  workshopMessage: string | null;
  locale: "en" | "de" | "ro" | "hu";
  accessExpiresAt: string;
  canCancel: boolean;
  history: Array<{ action: string; newStatus: string; confirmedStart: string | null; proposedStart: string | null; note: string | null; createdAt: string }>;
  estimate: null | {
    id: string;
    version: number;
    status: "awaiting_customer" | "approved" | "declined" | "superseded";
    diagnosisSummary: string;
    customerNote: string | null;
    currency: string;
    totalCents: number;
    decisionNote: string | null;
    items: Array<{ type: string; description: string; quantity: number; unitPriceCents: number; lineTotalCents: number }>;
  };
  whatsapp: BookingWhatsAppState;
};

export async function loadGuestBookingAccess(digest: string) {
  const [{ data, error }, whatsapp] = await Promise.all([
    createServiceClient().rpc("get_booking_access_session", { requested_token_digest: digest }),
    loadGuestBookingWhatsAppState(digest),
  ]);
  if (error) throw new DataAccessError(error.code === "42501" ? "unauthorized" : "unavailable");
  return data && typeof data === "object" ? { ...(data as Omit<GuestBookingAccess, "whatsapp">), whatsapp } : null;
}

export async function manageGuestBooking(input: {
  digest: string;
  action: "accept_proposal" | "decline_proposal" | "cancel";
  note: string | null;
}) {
  const { data, error } = await createServiceClient().rpc("manage_booking_with_access_token", {
    requested_token_digest: input.digest,
    requested_action: input.action,
    requested_note: input.note,
  });
  if (error) throw new DataAccessError(error.code === "42501" ? "unauthorized" : error.code === "23514" ? "conflict" : "unavailable");
  return data as string;
}

export async function decideGuestEstimate(input: {
  digest: string;
  estimateId: string;
  decision: "approve" | "decline";
  note: string | null;
}) {
  const { data, error } = await createServiceClient().rpc("decide_estimate_with_access_token", {
    requested_token_digest: input.digest,
    requested_estimate_id: input.estimateId,
    requested_decision: input.decision,
    requested_note: input.note,
  });
  if (error) throw new DataAccessError(error.code === "42501" ? "unauthorized" : error.code === "23514" ? "conflict" : "unavailable");
  return data as string;
}
