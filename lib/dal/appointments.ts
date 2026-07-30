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
  slotDurationMinutes: 15 | 30 | 45 | null;
};

export type DoctorAvailability = {
  clinicianId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: 15 | 30 | 45;
  isActive: boolean;
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
  slot_duration_minutes: Appointment["slotDurationMinutes"];
};

export async function loadAppointments(
  clinicianIds: string[],
): Promise<Appointment[]> {
  if (!clinicianIds.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, clinician_id, patient_name, patient_phone, patient_email, source, status, scheduled_start, scheduled_end, locale, operational_note, slot_duration_minutes",
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
    slotDurationMinutes: row.slot_duration_minutes,
  }));
}

export async function loadDoctorAvailability(
  clinicianIds: string[],
): Promise<DoctorAvailability[]> {
  if (!clinicianIds.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("doctor_availability")
    .select("clinician_id, weekday, start_time, end_time, slot_duration_minutes, is_active")
    .in("clinician_id", clinicianIds)
    .order("weekday");
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  return (data ?? []).map((row) => ({
    clinicianId: row.clinician_id as string,
    weekday: row.weekday as number,
    startTime: row.start_time as string,
    endTime: row.end_time as string,
    slotDurationMinutes: row.slot_duration_minutes as 15 | 30 | 45,
    isActive: row.is_active as boolean,
  }));
}

export async function saveDoctorAvailability(input: {
  weekday: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: 15 | 30 | 45;
  isActive: boolean;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_my_weekly_availability", {
    requested_weekday: input.weekday,
    requested_start_time: input.startTime,
    requested_end_time: input.endTime,
    requested_slot_duration_minutes: input.slotDurationMinutes,
    requested_is_active: input.isActive,
    request_correlation_id: crypto.randomUUID(),
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}

export type CreateAppointmentInput = {
  clinicianId: string;
  patientName: string;
  patientPhone: string;
  patientEmail: string | null;
  source: Appointment["source"];
  scheduledStart: string;
  slotDurationMinutes: 15 | 30 | 45;
  locale: Appointment["locale"];
  operationalNote: string | null;
  initialStatus: "pending" | "confirmed";
};

export async function createManagedAppointment(input: CreateAppointmentInput) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_slotted_appointment", {
    requested_clinician_id: input.clinicianId,
    requested_patient_name: input.patientName,
    requested_patient_phone: input.patientPhone,
    requested_patient_email: input.patientEmail,
    requested_source: input.source,
    requested_scheduled_start: input.scheduledStart,
    requested_slot_duration_minutes: input.slotDurationMinutes,
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

export async function rescheduleSlottedAppointment(
  appointmentId: string,
  scheduledStart: string,
  slotDurationMinutes: 15 | 30 | 45,
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reschedule_slotted_appointment", {
    requested_appointment_id: appointmentId,
    requested_scheduled_start: scheduledStart,
    requested_slot_duration_minutes: slotDurationMinutes,
    request_correlation_id: crypto.randomUUID(),
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}
