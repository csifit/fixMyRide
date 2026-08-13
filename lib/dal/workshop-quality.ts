import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type WarrantyCase = {
  id: string;
  workshopId: string;
  workshopName: string;
  kind: "warranty" | "comeback";
  status: "open" | "resolved";
  originalBookingId: string;
  returnBookingId: string;
  vehicleRegistration: string;
  customerName: string;
  serviceName: string;
  originalCompletedAt: string;
  technicianName: string | null;
  labourWarrantyExpiresOn: string | null;
  partsWarranty: Array<{ description: string; expiresOn: string }>;
  internalNotes: string | null;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type QualityJob = {
  id: string;
  workshopId: string;
  workshopName: string;
  customerName: string;
  vehicleRegistration: string;
  vehicleLabel: string;
  serviceName: string;
  completedAt?: string;
  status?: string;
  labourWarrantyExpiresOn?: string | null;
};

export type MaintenanceDueReminder = {
  id: string;
  workshopId: string;
  workshopName: string;
  workshopSlug: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  vehicleRegistration: string;
  vehicleLabel: string;
  description: string;
  dueOn: string | null;
  dueMileageKm: number | null;
  lastOutreach: { channel: "phone" | "email" | "in_app"; status: string; createdAt: string } | null;
};

export type ManagedQualityWorkspace = {
  cases: WarrantyCase[];
  originalJobs: QualityJob[];
  returnJobs: QualityJob[];
  mechanics: Array<{ id: string; workshopId: string; name: string }>;
  dueReminders: MaintenanceDueReminder[];
};

export type MaintenanceOutreachContext = {
  recommendationId: string;
  workshopId: string;
  workshopName: string;
  workshopSlug: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  description: string;
  dueOn: string | null;
  vehicleRegistration: string;
};

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadManagedQualityWorkspace(): Promise<ManagedQualityWorkspace> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_managed_quality_workspace");
  if (error) fail(error);
  return data as ManagedQualityWorkspace;
}

export async function setWorkshopJobWarranty(bookingId: string, labourWarrantyExpiresOn: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_workshop_job_warranty", {
    requested_booking_id: bookingId,
    requested_labour_warranty_expires_on: labourWarrantyExpiresOn,
  });
  if (error) fail(error);
}

export async function createWorkshopWarrantyCase(input: {
  originalBookingId: string;
  returnBookingId: string;
  kind: "warranty" | "comeback";
  technicianResourceId: string | null;
  internalNotes: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_workshop_warranty_case", {
    requested_original_booking_id: input.originalBookingId,
    requested_return_booking_id: input.returnBookingId,
    requested_case_kind: input.kind,
    requested_responsible_technician_resource_id: input.technicianResourceId,
    requested_internal_notes: input.internalNotes,
  });
  if (error) fail(error);
}

export async function resolveWorkshopWarrantyCase(caseId: string, resolution: string, internalNotes: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_workshop_warranty_case", {
    requested_case_id: caseId,
    requested_resolution: resolution,
    requested_internal_notes: internalNotes,
  });
  if (error) fail(error);
}

export async function loadMaintenanceOutreachContext(recommendationId: string): Promise<MaintenanceOutreachContext> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_managed_maintenance_outreach_context", {
    requested_recommendation_id: recommendationId,
  });
  if (error || !data) fail(error ?? { code: "P0002" });
  return data as MaintenanceOutreachContext;
}

export async function recordMaintenanceOutreach(input: {
  recommendationId: string;
  channel: "phone" | "email" | "in_app";
  status: "contacted" | "not_reached" | "sent" | "failed";
  note: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_workshop_maintenance_outreach", {
    requested_recommendation_id: input.recommendationId,
    requested_channel: input.channel,
    requested_status: input.status,
    requested_note: input.note,
  });
  if (error) fail(error);
}

