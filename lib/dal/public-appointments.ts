import "server-only";

import { createClient } from "@/lib/supabase/server";
import { DataAccessError, classifyDatabaseError } from "./errors";

export type PublicDoctor = {
  id: string;
  name: string;
  specialty: string;
  clinicName: string;
  clinicCountry: string;
  city: string | null;
  practiceAddress: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type PublicSlot = {
  scheduledStart: string;
  slotDurationMinutes: 15 | 30 | 45;
};

export type PublicAppointmentRequest = {
  id: string;
  clinicianId: string;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  scheduledStart: string;
  scheduledEnd: string;
  slotDurationMinutes: 15 | 30 | 45;
  locale: "en" | "de" | "ro" | "hu";
  patientNote: string | null;
  status: "pending" | "confirmed" | "declined" | "cancelled";
};

export type PublicAppointmentChangeRequest = {
  id: string;
  publicRequestId: string;
  appointmentId: string;
  clinicianId: string;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  locale: "en" | "de" | "ro" | "hu";
  requestType: "cancel" | "reschedule";
  currentStart: string;
  requestedStart: string | null;
  requestedSlotDurationMinutes: 15 | 30 | 45 | null;
  patientNote: string | null;
  status: "pending" | "approved" | "declined";
};

export type ManagedPublicRequestDetails = {
  id: string;
  clinicianId: string;
  patientName: string;
  patientEmail: string;
  locale: "en" | "de" | "ro" | "hu";
  doctorName: string;
  clinicName: string;
  scheduledStart: string;
  slotDurationMinutes: 15 | 30 | 45;
  status: PublicAppointmentRequest["status"];
};

export async function searchPublicDoctors(search = ""): Promise<PublicDoctor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_public_doctors", {
    requested_search: search || null,
  });
  if (error) {
    console.error("search_public_doctors", { code: error.code });
    throw new DataAccessError(classifyDatabaseError(error));
  }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.clinician_id as string,
    name: row.full_name as string,
    specialty: row.specialty as string,
    clinicName: row.clinic_name as string,
    clinicCountry: row.clinic_country as string,
    city: typeof row.city === "string" ? row.city : null,
    practiceAddress: typeof row.practice_address === "string"
      ? row.practice_address
      : null,
    latitude: row.latitude === null || row.latitude === undefined
      ? null
      : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined
      ? null
      : Number(row.longitude),
  }));
}

export async function getPublicDoctor(clinicianId: string) {
  const doctors = await searchPublicDoctors("");
  return doctors.find((doctor) => doctor.id === clinicianId) ?? null;
}

export async function loadPublicDoctorSlots(
  clinicianId: string,
  date: string,
): Promise<PublicSlot[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_doctor_slots", {
    requested_clinician_id: clinicianId,
    requested_date: date,
  });
  if (error) {
    console.error("get_public_doctor_slots", { code: error.code });
    throw new DataAccessError(classifyDatabaseError(error));
  }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    scheduledStart: row.scheduled_start as string,
    slotDurationMinutes: row.slot_duration_minutes as 15 | 30 | 45,
  }));
}

export async function createPublicAppointmentRequest(input: {
  clinicianId: string;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  scheduledStart: string;
  slotDurationMinutes: 15 | 30 | 45;
  locale: "en" | "de" | "ro" | "hu";
  patientNote: string | null;
  managementTokenDigest: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_public_appointment_request", {
    requested_clinician_id: input.clinicianId,
    requested_patient_name: input.patientName,
    requested_patient_phone: input.patientPhone,
    requested_patient_email: input.patientEmail,
    requested_scheduled_start: input.scheduledStart,
    requested_slot_duration_minutes: input.slotDurationMinutes,
    requested_locale: input.locale,
    requested_patient_note: input.patientNote,
    requested_management_token_digest: `\\x${input.managementTokenDigest}`,
  });
  if (error) {
    console.error("create_public_appointment_request", { code: error.code });
    throw new DataAccessError(classifyDatabaseError(error));
  }
  return data as string;
}

export async function loadPublicAppointmentStatus(tokenDigest: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_appointment_management", {
    requested_management_token_digest: `\\x${tokenDigest}`,
  });
  if (error) {
    console.error("get_public_appointment_management", { code: error.code });
    throw new DataAccessError(classifyDatabaseError(error));
  }
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.request_id as string,
    clinicianId: row.clinician_id as string,
    doctorName: row.doctor_name as string,
    specialty: row.specialty as string,
    clinicName: row.clinic_name as string,
    scheduledStart: row.scheduled_start as string,
    slotDurationMinutes: row.slot_duration_minutes as 15 | 30 | 45,
    status: row.booking_status as PublicAppointmentRequest["status"] | "completed" | "no_show",
    changeRequest: row.change_request_id ? {
      id: row.change_request_id as string,
      requestType: row.change_request_type as "cancel" | "reschedule",
      status: row.change_request_status as "pending" | "approved" | "declined",
      requestedStart: row.requested_change_start as string | null,
      requestedSlotDurationMinutes:
        row.requested_change_duration_minutes as 15 | 30 | 45 | null,
    } : null,
  };
}

export async function cancelPendingPublicAppointment(tokenDigest: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_pending_public_appointment_request", {
    requested_management_token_digest: `\\x${tokenDigest}`,
  });
  if (error) {
    console.error("cancel_pending_public_appointment_request", { code: error.code });
    throw new DataAccessError(classifyDatabaseError(error));
  }
}

export async function createPublicAppointmentChange(input: {
  tokenDigest: string;
  requestType: "cancel" | "reschedule";
  scheduledStart: string | null;
  slotDurationMinutes: 15 | 30 | 45 | null;
  patientNote: string | null;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_public_appointment_change_request", {
    requested_management_token_digest: `\\x${input.tokenDigest}`,
    requested_change_type: input.requestType,
    requested_scheduled_start: input.scheduledStart,
    requested_slot_duration_minutes: input.slotDurationMinutes,
    requested_patient_note: input.patientNote,
  });
  if (error) {
    console.error("create_public_appointment_change_request", { code: error.code });
    throw new DataAccessError(classifyDatabaseError(error));
  }
  return data as string;
}

export async function loadManagedAppointmentRequests(
  clinicianIds: string[],
): Promise<PublicAppointmentRequest[]> {
  if (!clinicianIds.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("load_managed_appointment_requests", {
    requested_clinician_ids: clinicianIds,
  });
  if (error) {
    console.error("load_managed_appointment_requests", { code: error.code });
    throw new DataAccessError(classifyDatabaseError(error));
  }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.request_id as string,
    clinicianId: row.clinician_id as string,
    patientName: row.patient_name as string,
    patientPhone: row.patient_phone as string,
    patientEmail: row.patient_email as string,
    scheduledStart: row.scheduled_start as string,
    scheduledEnd: row.scheduled_end as string,
    slotDurationMinutes: row.slot_duration_minutes as 15 | 30 | 45,
    locale: row.locale as PublicAppointmentRequest["locale"],
    patientNote: row.patient_note as string | null,
    status: row.status as PublicAppointmentRequest["status"],
  }));
}

export async function decidePublicAppointmentRequest(
  requestId: string,
  decision: "confirmed" | "declined",
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_public_appointment_request", {
    requested_request_id: requestId,
    requested_decision: decision,
    request_correlation_id: crypto.randomUUID(),
  });
  if (error) {
    console.error("decide_public_appointment_request", { code: error.code });
    throw new DataAccessError(classifyDatabaseError(error));
  }
  return data as string | null;
}

export async function loadManagedAppointmentChangeRequests(
  clinicianIds: string[],
): Promise<PublicAppointmentChangeRequest[]> {
  if (!clinicianIds.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "load_managed_appointment_change_requests",
    { requested_clinician_ids: clinicianIds },
  );
  if (error) {
    console.error("load_managed_appointment_change_requests", { code: error.code });
    throw new DataAccessError(classifyDatabaseError(error));
  }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.change_request_id as string,
    publicRequestId: row.public_request_id as string,
    appointmentId: row.appointment_id as string,
    clinicianId: row.clinician_id as string,
    patientName: row.patient_name as string,
    patientPhone: row.patient_phone as string,
    patientEmail: row.patient_email as string,
    locale: row.locale as PublicAppointmentChangeRequest["locale"],
    requestType: row.request_type as PublicAppointmentChangeRequest["requestType"],
    currentStart: row.current_start as string,
    requestedStart: row.requested_start as string | null,
    requestedSlotDurationMinutes:
      row.requested_slot_duration_minutes as 15 | 30 | 45 | null,
    patientNote: row.patient_note as string | null,
    status: row.status as PublicAppointmentChangeRequest["status"],
  }));
}

export async function loadManagedPublicRequestDetails(
  requestId: string,
): Promise<ManagedPublicRequestDetails | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_managed_public_appointment_request",
    { requested_request_id: requestId },
  );
  if (error) {
    console.error("get_managed_public_appointment_request", { code: error.code });
    throw new DataAccessError(classifyDatabaseError(error));
  }
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.request_id as string,
    clinicianId: row.clinician_id as string,
    patientName: row.patient_name as string,
    patientEmail: row.patient_email as string,
    locale: row.locale as ManagedPublicRequestDetails["locale"],
    doctorName: row.doctor_name as string,
    clinicName: row.clinic_name as string,
    scheduledStart: row.scheduled_start as string,
    slotDurationMinutes: row.slot_duration_minutes as 15 | 30 | 45,
    status: row.status as ManagedPublicRequestDetails["status"],
  };
}

export async function loadManagedChangeRequestDetails(changeRequestId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_managed_public_appointment_change_request",
    { requested_change_request_id: changeRequestId },
  );
  if (error) {
    console.error("get_managed_public_appointment_change_request", { code: error.code });
    throw new DataAccessError(classifyDatabaseError(error));
  }
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.change_request_id as string,
    clinicianId: row.clinician_id as string,
    patientName: row.patient_name as string,
    patientEmail: row.patient_email as string,
    locale: row.locale as ManagedPublicRequestDetails["locale"],
    doctorName: row.doctor_name as string,
    clinicName: row.clinic_name as string,
    requestType: row.request_type as "cancel" | "reschedule",
    currentStart: row.current_start as string,
    requestedStart: row.requested_start as string | null,
    requestedSlotDurationMinutes:
      row.requested_slot_duration_minutes as 15 | 30 | 45 | null,
    status: row.status as "pending" | "approved" | "declined",
  };
}

export async function decidePublicAppointmentChange(
  changeRequestId: string,
  decision: "approved" | "declined",
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "decide_public_appointment_change_request",
    {
      requested_change_request_id: changeRequestId,
      requested_decision: decision,
      request_correlation_id: crypto.randomUUID(),
    },
  );
  if (error) {
    console.error("decide_public_appointment_change_request", { code: error.code });
    throw new DataAccessError(classifyDatabaseError(error));
  }
}
