import "server-only";

import { createClient } from "../supabase/server";
import { DataAccessError, classifyDatabaseError } from "./errors";

export type Appointment = {
  id: string;
  clinicianId: string;
  patientName: string;
  patientPhone: string;
  patientEmail: string | null;
  source: "online" | "phone" | "walk_in" | "email" | "other";
  status: "pending" | "confirmed" | "rescheduled" | "cancelled" | "completed" | "no_show";
  scheduledStart: string;
  scheduledEnd: string;
  locale: "en" | "de" | "ro" | "hu";
  operationalNote: string | null;
};

type AppointmentRow = {
  id: string;
  clinician_id: string;
  patient_name: string;
  patient_phone: string;
  patient_email: string | null;
  source: Appointment["source"];
  status: Appointment["status"];
  scheduled_start: string;
  scheduled_end: string;
  locale: Appointment["locale"];
  operational_note: string | null;
};

export async function loadAppointments(
  clinicianIds: string[],
): Promise<Appointment[]> {
  if (!clinicianIds.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, clinician_id, patient_name, patient_phone, patient_email, source, status, scheduled_start, scheduled_end, locale, operational_note",
    )
    .in("clinician_id", clinicianIds)
    .order("scheduled_start", { ascending: true });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  return ((data ?? []) as AppointmentRow[]).map((row) => ({
    id: row.id,
    clinicianId: row.clinician_id,
    patientName: row.patient_name,
    patientPhone: row.patient_phone,
    patientEmail: row.patient_email,
    source: row.source,
    status: row.status,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    locale: row.locale,
    operationalNote: row.operational_note,
  }));
}

export type CreateAppointmentInput = {
  clinicianId: string;
  patientName: string;
  patientPhone: string;
  patientEmail: string | null;
  source: Appointment["source"];
  scheduledStart: string;
  scheduledEnd: string;
  locale: Appointment["locale"];
  operationalNote: string | null;
  initialStatus: "pending" | "confirmed";
};

export async function createManagedAppointment(input: CreateAppointmentInput) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_managed_appointment", {
    requested_clinician_id: input.clinicianId,
    requested_patient_id: null,
    requested_patient_name: input.patientName,
    requested_patient_phone: input.patientPhone,
    requested_patient_email: input.patientEmail,
    requested_source: input.source,
    requested_scheduled_start: input.scheduledStart,
    requested_scheduled_end: input.scheduledEnd,
    requested_locale: input.locale,
    requested_operational_note: input.operationalNote,
    requested_initial_status: input.initialStatus,
    request_correlation_id: crypto.randomUUID(),
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  return data as string;
}

export async function transitionManagedAppointment(
  appointmentId: string,
  status: Appointment["status"],
  scheduledStart: string | null,
  scheduledEnd: string | null,
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("transition_managed_appointment", {
    requested_appointment_id: appointmentId,
    requested_status: status,
    requested_scheduled_start: scheduledStart,
    requested_scheduled_end: scheduledEnd,
    request_correlation_id: crypto.randomUUID(),
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}
