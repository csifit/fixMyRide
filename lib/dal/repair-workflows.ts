import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";
import type { BookingHistoryItem, ManagedBookingStatus } from "./workshop-bookings";

export type RepairEstimateItem = {
  type: "labor" | "part" | "other";
  description: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type RepairEstimate = {
  id: string;
  version: number;
  status: "awaiting_customer" | "approved" | "declined" | "superseded";
  diagnosisSummary: string;
  customerNote: string | null;
  currency: "EUR" | "HUF" | "RON";
  laborCents: number;
  partsCents: number;
  otherCents: number;
  totalCents: number;
  sentAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  items: RepairEstimateItem[];
};

export type ManagedRepairWorkflow = {
  id: string;
  workshopId: string;
  workshopName: string;
  serviceName: string;
  status: ManagedBookingStatus;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  vehicleRegistration: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  mileageKm: number | null;
  confirmedStart: string | null;
  customerNote: string | null;
  workshopNote: string | null;
  estimate: RepairEstimate | null;
  history: BookingHistoryItem[];
};

export type RepairWorkflowAction =
  | "check_in" | "start_diagnosis" | "submit_estimate" | "start_work"
  | "ready_for_collection" | "complete" | "mark_no_show";

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadManagedRepairWorkflows(): Promise<ManagedRepairWorkflow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_managed_repair_workflows");
  if (error) fail(error);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.booking_id as string,
    workshopId: row.workshop_id as string,
    workshopName: row.workshop_name as string,
    serviceName: row.service_name as string,
    status: row.booking_status as ManagedBookingStatus,
    customerName: row.customer_name as string,
    customerPhone: row.customer_phone as string,
    customerEmail: row.customer_email as string,
    vehicleRegistration: row.vehicle_registration as string,
    vehicleMake: row.vehicle_make as string,
    vehicleModel: row.vehicle_model as string,
    vehicleYear: row.vehicle_year === null ? null : Number(row.vehicle_year),
    mileageKm: row.mileage_km === null ? null : Number(row.mileage_km),
    confirmedStart: row.confirmed_start as string | null,
    customerNote: row.customer_note as string | null,
    workshopNote: row.workshop_note as string | null,
    estimate: row.estimate as RepairEstimate | null,
    history: Array.isArray(row.history) ? row.history as BookingHistoryItem[] : [],
  }));
}

export async function manageRepairWorkflow(input: {
  bookingId: string;
  action: RepairWorkflowAction;
  diagnosis: string | null;
  items: Array<{ type: "labor" | "part" | "other"; description: string; quantity: number; unitPriceCents: number }>;
  currency: "EUR" | "HUF" | "RON";
  note: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("manage_repair_workflow", {
    requested_booking_id: input.bookingId,
    requested_action: input.action,
    requested_diagnosis: input.diagnosis,
    requested_items: input.items,
    requested_currency: input.currency,
    requested_note: input.note,
  });
  if (error) fail(error);
}
