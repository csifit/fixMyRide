import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type ManagedBookingStatus =
  | "requested"
  | "confirmed"
  | "checked_in"
  | "diagnosing"
  | "awaiting_approval"
  | "in_service"
  | "ready_for_collection"
  | "completed"
  | "declined"
  | "cancelled"
  | "no_show";

export type BookingHistoryItem = {
  action: string;
  previousStatus: ManagedBookingStatus | null;
  newStatus: ManagedBookingStatus;
  previousConfirmedStart: string | null;
  newConfirmedStart: string | null;
  proposedStart: string | null;
  note: string | null;
  createdAt: string;
};

export type ManagedWorkshopBooking = {
  id: string;
  workshopId: string;
  workshopName: string;
  serviceName: string;
  serviceCategory: string;
  status: ManagedBookingStatus;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  vehicleRegistration: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  mileageKm: number | null;
  preferredStart: string;
  alternateStart: string | null;
  confirmedStart: string | null;
  proposedStart: string | null;
  proposalNote: string | null;
  customerNote: string | null;
  workshopNote: string | null;
  mobilityRequirement: string | null;
  locale: string;
  createdAt: string;
  history: BookingHistoryItem[];
};

export type ManageWorkshopBookingInput = {
  bookingId: string;
  action: "confirm" | "propose_time" | "reschedule" | "decline" | "cancel";
  start: string | null;
  note: string | null;
};

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadManagedWorkshopBookings(): Promise<ManagedWorkshopBooking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_managed_service_booking_requests", {
    requested_status: null,
  });
  if (error) fail(error);

  const rows = (data ?? []) as unknown[];
  return rows.map((value: unknown) => {
    const row = value as Record<string, unknown>;
    return {
      id: row.booking_id as string,
      workshopId: row.workshop_id as string,
      workshopName: row.workshop_name as string,
      serviceName: row.service_name as string,
      serviceCategory: row.service_category as string,
      status: row.booking_status as ManagedBookingStatus,
      customerName: row.customer_name as string,
      customerPhone: row.customer_phone as string,
      customerEmail: row.customer_email as string,
      vehicleRegistration: row.vehicle_registration as string,
      vehicleMake: row.vehicle_make as string,
      vehicleModel: row.vehicle_model as string,
      vehicleYear: row.vehicle_year === null ? null : Number(row.vehicle_year),
      mileageKm: row.mileage_km === null ? null : Number(row.mileage_km),
      preferredStart: row.preferred_start as string,
      alternateStart: row.alternate_start as string | null,
      confirmedStart: row.confirmed_start as string | null,
      proposedStart: row.proposed_start as string | null,
      proposalNote: row.proposal_note as string | null,
      customerNote: row.customer_note as string | null,
      workshopNote: row.workshop_note as string | null,
      mobilityRequirement: row.mobility_requirement as string | null,
      locale: row.locale as string,
      createdAt: row.created_at as string,
      history: Array.isArray(row.history) ? row.history as BookingHistoryItem[] : [],
    };
  });
}

export async function manageWorkshopBooking(input: ManageWorkshopBookingInput) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("manage_service_booking_request", {
    requested_booking_id: input.bookingId,
    requested_action: input.action,
    requested_start: input.start,
    requested_note: input.note,
  });
  if (error) fail(error);
}
