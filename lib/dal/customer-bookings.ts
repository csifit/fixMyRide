import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";
import type { BookingHistoryItem, ManagedBookingStatus } from "./workshop-bookings";
import type { RepairEstimate } from "./repair-workflows";

export type CustomerBooking = {
  id: string;
  workshopId: string;
  workshopName: string;
  workshopPhone: string | null;
  workshopEmail: string | null;
  workshopCity: string | null;
  workshopAddress: string | null;
  serviceName: string;
  serviceCategory: string;
  status: ManagedBookingStatus;
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
  workshopNote: string | null;
  createdAt: string;
  canCancel: boolean;
  history: BookingHistoryItem[];
  estimate: RepairEstimate | null;
  feedback: { rating: number; comment: string | null; updatedAt: string } | null;
};

export type ManageCustomerBookingInput = {
  bookingId: string;
  action: "accept_proposal" | "decline_proposal" | "cancel";
  note: string | null;
};

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadMyServiceBookings(): Promise<CustomerBooking[]> {
  const supabase = await createClient();
  const [bookingsResult, estimatesResult, feedbackResult] = await Promise.all([
    supabase.rpc("get_my_service_booking_requests"),
    supabase.rpc("get_my_repair_estimates"),
    supabase.rpc("get_my_service_booking_feedback"),
  ]);
  if (bookingsResult.error) fail(bookingsResult.error);
  if (estimatesResult.error) fail(estimatesResult.error);
  if (feedbackResult.error) fail(feedbackResult.error);
  const estimates = new Map(
    ((estimatesResult.data ?? []) as Record<string, unknown>[])
      .map((row) => [row.booking_id as string, row.estimate as RepairEstimate]),
  );
  const feedback = new Map(
    ((feedbackResult.data ?? []) as Record<string, unknown>[]).map((row) => [row.booking_id as string, {
      rating: Number(row.rating), comment: row.comment as string | null, updatedAt: row.updated_at as string,
    }]),
  );

  return ((bookingsResult.data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.booking_id as string,
    workshopId: row.workshop_id as string,
    workshopName: row.workshop_name as string,
    workshopPhone: row.workshop_phone as string | null,
    workshopEmail: row.workshop_email as string | null,
    workshopCity: row.workshop_city as string | null,
    workshopAddress: row.workshop_address as string | null,
    serviceName: row.service_name as string,
    serviceCategory: row.service_category as string,
    status: row.booking_status as ManagedBookingStatus,
    vehicleRegistration: row.vehicle_registration as string,
    vehicleMake: row.vehicle_make as string,
    vehicleModel: row.vehicle_model as string,
    vehicleYear: row.vehicle_year === null ? null : Number(row.vehicle_year),
    preferredStart: row.preferred_start as string,
    alternateStart: row.alternate_start as string | null,
    confirmedStart: row.confirmed_start as string | null,
    proposedStart: row.proposed_start as string | null,
    proposalNote: row.proposal_note as string | null,
    customerNote: row.customer_note as string | null,
    workshopNote: row.workshop_note as string | null,
    createdAt: row.created_at as string,
    canCancel: Boolean(row.can_cancel),
    history: Array.isArray(row.history) ? row.history as BookingHistoryItem[] : [],
    estimate: estimates.get(row.booking_id as string) ?? null,
    feedback: feedback.get(row.booking_id as string) ?? null,
  }));
}

export async function submitMyServiceBookingFeedback(input: { bookingId: string; rating: number; comment: string | null }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_my_service_booking_feedback", {
    requested_booking_id: input.bookingId,
    requested_rating: input.rating,
    requested_comment: input.comment,
  });
  if (error) fail(error);
}

export async function manageMyServiceBooking(input: ManageCustomerBookingInput) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("manage_my_service_booking_request", {
    requested_booking_id: input.bookingId,
    requested_action: input.action,
    requested_note: input.note,
  });
  if (error) fail(error);
}

export async function decideMyRepairEstimate(input: {
  estimateId: string;
  decision: "approve" | "decline";
  note: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_my_repair_estimate", {
    requested_estimate_id: input.estimateId,
    requested_decision: input.decision,
    requested_note: input.note,
  });
  if (error) fail(error);
}
