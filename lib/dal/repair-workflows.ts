import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";
import type { BookingHistoryItem, ManagedBookingStatus } from "./workshop-bookings";
import { loadManagedVehicleServiceRecords, type VehicleServiceRecord } from "./vehicle-service-history";
import { loadManagedServiceOrderFields } from "./service-orders";
import type { BookingResource } from "./workshop-scheduling";
import { loadCustomerInvoicingPreferences } from "./customer-invoicing";

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
  vehicleVin: string | null;
  confirmedStart: string | null;
  customerNote: string | null;
  workshopNote: string | null;
  serviceOrderNumber: string | null;
  serviceOrderMechanicOverride: string | null;
  vehicleReceptionCondition: string | null;
  assignedResources: BookingResource[];
  estimate: RepairEstimate | null;
  serviceRecord: VehicleServiceRecord;
  customerInvoicingEnabled: boolean;
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
  const [{ data, error }, records, serviceOrders, invoicingPreferences, internalNotesResult] = await Promise.all([
    supabase.rpc("get_managed_repair_workflows"),
    loadManagedVehicleServiceRecords(),
    loadManagedServiceOrderFields(),
    loadCustomerInvoicingPreferences(),
    supabase.rpc("get_managed_booking_internal_notes"),
  ]);
  if (error) fail(error);
  if (internalNotesResult.error) fail(internalNotesResult.error);
  const invoicingByWorkshop = new Map(invoicingPreferences.map((item) => [item.workshopId, item.effectiveEnabled]));
  const internalNotes = new Map(((internalNotesResult.data ?? []) as Record<string, unknown>[])
    .map((row) => [row.booking_id as string, row.internal_note as string | null]));
  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const record = records.get(row.booking_id as string) ?? {
      id: null, vehicleVin: null, mileageKm: null, workSummary: null,
      inspectionSummary: null, invoiceNumber: null, invoiceIssuedOn: null,
      invoiceTotalCents: null, invoiceCurrency: null, parts: [], recommendations: [],
    };
    const serviceOrder = serviceOrders.get(row.booking_id as string) ?? {
      orderNumber: null, mechanicOverride: null, receptionCondition: null, resources: [],
    };
    return ({
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
    vehicleVin: record.vehicleVin ?? null,
    confirmedStart: row.confirmed_start as string | null,
    customerNote: row.customer_note as string | null,
    workshopNote: internalNotes.get(row.booking_id as string) ?? null,
    serviceOrderNumber: serviceOrder.orderNumber,
    serviceOrderMechanicOverride: serviceOrder.mechanicOverride,
    vehicleReceptionCondition: serviceOrder.receptionCondition,
    assignedResources: serviceOrder.resources,
    estimate: row.estimate as RepairEstimate | null,
    serviceRecord: record,
    customerInvoicingEnabled: invoicingByWorkshop.get(row.workshop_id as string) ?? true,
    history: Array.isArray(row.history) ? row.history as BookingHistoryItem[] : [],
  }); });
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
