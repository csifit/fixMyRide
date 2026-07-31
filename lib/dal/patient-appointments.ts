import "server-only";

import { readSupabaseEnvironment } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { DataAccessError, classifyDatabaseError } from "./errors";

export type PatientAccess =
  | { state: "configuration" | "unauthenticated" | "unauthorized" | "unavailable" }
  | { state: "active"; patient: { id: string; fullName: string } };

export type PatientAppointment = {
  id: string;
  publicRequestId: string | null;
  appointmentId: string | null;
  clinicianId: string;
  doctorName: string;
  specialty: string;
  clinicName: string;
  scheduledStart: string;
  scheduledEnd: string;
  slotDurationMinutes: 15 | 30 | 45;
  status: "pending" | "confirmed" | "declined" | "cancelled" | "completed" | "no_show";
  source: "online" | "phone" | "walk_in" | "email" | "other";
  changeRequest: {
    id: string;
    requestType: "cancel" | "reschedule";
    status: "pending" | "approved" | "declined";
    requestedStart: string | null;
    requestedSlotDurationMinutes: 15 | 30 | 45 | null;
  } | null;
};

export async function getPatientAccess(): Promise<PatientAccess> {
  if (!readSupabaseEnvironment().configured) return { state: "configuration" };
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError) return { state: "unavailable" };
  if (!claims?.claims?.sub) return { state: "unauthenticated" };
  const { data, error } = await supabase
    .from("patients")
    .select("id, full_name, archived_at")
    .eq("auth_user_id", claims.claims.sub)
    .maybeSingle();
  if (error) return { state: "unavailable" };
  if (!data || data.archived_at) return { state: "unauthorized" };
  return {
    state: "active",
    patient: { id: data.id, fullName: data.full_name },
  };
}

export async function loadMyPatientAppointments(): Promise<PatientAppointment[]> {
  const supabase = await createClient();
  const { error: linkError } = await supabase.rpc("link_my_appointment_history");
  if (linkError) {
    console.error("link_my_appointment_history", { code: linkError.code });
    throw new DataAccessError(classifyDatabaseError(linkError));
  }
  const { data, error } = await supabase.rpc("load_my_patient_appointments");
  if (error) {
    console.error("load_my_patient_appointments", { code: error.code });
    throw new DataAccessError(classifyDatabaseError(error));
  }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.booking_id as string,
    publicRequestId: row.public_request_id as string | null,
    appointmentId: row.appointment_id as string | null,
    clinicianId: row.clinician_id as string,
    doctorName: row.doctor_name as string,
    specialty: row.specialty as string,
    clinicName: row.clinic_name as string,
    scheduledStart: row.scheduled_start as string,
    scheduledEnd: row.scheduled_end as string,
    slotDurationMinutes: row.slot_duration_minutes as 15 | 30 | 45,
    status: row.booking_status as PatientAppointment["status"],
    source: row.booking_source as PatientAppointment["source"],
    changeRequest: row.change_request_id ? {
      id: row.change_request_id as string,
      requestType: row.change_request_type as "cancel" | "reschedule",
      status: row.change_request_status as "pending" | "approved" | "declined",
      requestedStart: row.requested_change_start as string | null,
      requestedSlotDurationMinutes:
        row.requested_change_duration_minutes as 15 | 30 | 45 | null,
    } : null,
  }));
}

export async function cancelMyPendingAppointment(publicRequestId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_my_pending_appointment_request", {
    requested_public_request_id: publicRequestId,
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}

export async function createMyAppointmentChange(input: {
  publicRequestId: string;
  requestType: "cancel" | "reschedule";
  scheduledStart: string | null;
  slotDurationMinutes: 15 | 30 | 45 | null;
  patientNote: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_my_appointment_change_request", {
    requested_public_request_id: input.publicRequestId,
    requested_change_type: input.requestType,
    requested_scheduled_start: input.scheduledStart,
    requested_slot_duration_minutes: input.slotDurationMinutes,
    requested_patient_note: input.patientNote,
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}
