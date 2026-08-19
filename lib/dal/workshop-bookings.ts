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
  customerPhone: string | null;
  customerEmail: string | null;
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
  source: "public_request" | "manager_phone" | "manager_walk_in" | "manager_other";
  durationMinutes: number;
  createdAt: string;
  history: BookingHistoryItem[];
  unreadCommunicationCount: number;
  latestCommunicationKind: string | null;
};

export type ManageWorkshopBookingInput = {
  bookingId: string;
  action: "confirm" | "propose_time" | "reschedule" | "decline" | "cancel";
  start: string | null;
  note: string | null;
};

export type CreateManualWorkshopAppointmentInput = {
  workshopId: string;
  serviceId: string;
  start: string;
  durationMinutes: number;
  source: "manager_phone" | "manager_walk_in" | "manager_other";
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  vehicleRegistration: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  vehicleVin: string | null;
  mileageKm: number | null;
  customerStates: string | null;
  locale: string;
};

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadManagedWorkshopBookings(): Promise<ManagedWorkshopBooking[]> {
  const supabase = await createClient();
  const [{ data, error }, communicationResult] = await Promise.all([
    supabase.rpc("get_managed_service_booking_requests_v2", { requested_status: null }),
    supabase.rpc("get_managed_booking_communication_counts"),
  ]);
  if (error) fail(error);
  if (communicationResult.error) fail(communicationResult.error);

  const communication = new Map(
    ((communicationResult.data ?? []) as Record<string, unknown>[]).map((row) => [row.booking_id as string, {
      count: Number(row.unread_count), kind: row.latest_event_kind as string | null,
    }]),
  );

  const rows = (data ?? []) as unknown[];
  return rows.map((value: unknown) => {
    const row = value as Record<string, unknown>;
    const communicationState = communication.get(row.booking_id as string);
    return {
      id: row.booking_id as string,
      workshopId: row.workshop_id as string,
      workshopName: row.workshop_name as string,
      serviceName: row.service_name as string,
      serviceCategory: row.service_category as string,
      status: row.booking_status as ManagedBookingStatus,
      customerName: row.customer_name as string,
      customerPhone: row.customer_phone as string | null,
      customerEmail: row.customer_email as string | null,
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
      source: row.booking_source as ManagedWorkshopBooking["source"],
      durationMinutes: Number(row.duration_minutes),
      createdAt: row.created_at as string,
      history: Array.isArray(row.history) ? row.history as BookingHistoryItem[] : [],
      unreadCommunicationCount: communicationState?.count ?? 0,
      latestCommunicationKind: communicationState?.kind ?? null,
    };
  });
}

export async function createManualWorkshopAppointment(input: CreateManualWorkshopAppointmentInput) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_managed_service_appointment_v3", {
    requested_workshop_id: input.workshopId,
    requested_service_id: input.serviceId,
    requested_start: input.start,
    requested_duration_minutes: input.durationMinutes,
    requested_source: input.source,
    requested_customer_name: input.customerName,
    requested_customer_phone: input.customerPhone,
    requested_customer_email: input.customerEmail,
    requested_vehicle_registration: input.vehicleRegistration,
    requested_vehicle_make: input.vehicleMake,
    requested_vehicle_model: input.vehicleModel,
    requested_vehicle_year: input.vehicleYear,
    requested_vehicle_vin: input.vehicleVin,
    requested_mileage_km: input.mileageKm,
    requested_note: input.customerStates,
    requested_locale: input.locale,
  });
  if (error) fail(error);
  return data as string;
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

export async function markManagedBookingCommunicationsRead(bookingId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_managed_booking_communications_read", {
    requested_booking_id: bookingId,
  });
  if (error) fail(error);
}
