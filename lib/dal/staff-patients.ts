import "server-only";

import { createClient } from "../supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type StaffPatientListItem = {
  id: string;
  vitapassId: string;
  fullName: string;
  dateOfBirth: string;
};

export type StaffMedicalProfile = StaffPatientListItem & {
  bloodGroup: string;
  rhFactor: string;
  sex: string;
  organDonor: boolean;
  allergies: string[];
  medications: string[];
  conditions: string[];
  surgeries: string[];
  implants: string[];
  emergencyContacts: Array<{ name: string; phone: string }>;
  diagnoses: string[];
};

export async function loadStaffPatientList(
  clinicianIds: string[],
): Promise<StaffPatientListItem[]> {
  if (!clinicianIds.length) return [];
  const supabase = await createClient();
  const { data: grants, error: grantError } = await supabase
    .from("patient_access_grants")
    .select("patient_id")
    .in("clinician_id", clinicianIds)
    .eq("status", "active")
    .eq("can_view", true);
  if (grantError) throw new DataAccessError(classifyDatabaseError(grantError));
  const patientIds = [...new Set((grants ?? []).map((grant) => grant.patient_id))];
  if (!patientIds.length) return [];
  const { data, error } = await supabase
    .from("patients")
    .select("id, vitapass_id, full_name, date_of_birth")
    .in("id", patientIds)
    .order("full_name");
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  return (data ?? []).map((patient) => ({
    id: patient.id,
    vitapassId: patient.vitapass_id,
    fullName: patient.full_name,
    dateOfBirth: patient.date_of_birth,
  }));
}

export async function loadStaffMedicalProfile(
  patientId: string,
): Promise<StaffMedicalProfile> {
  const supabase = await createClient();
  const { error: auditError } = await supabase.rpc(
    "record_staff_patient_profile_view",
    {
      requested_patient_id: patientId,
      request_correlation_id: crypto.randomUUID(),
    },
  );
  if (auditError) throw new DataAccessError(classifyDatabaseError(auditError));
  const [
    patientResult, allergyResult, medicationResult, conditionResult,
    surgeryResult, implantResult, contactResult, diagnosisResult,
  ] = await Promise.all([
    supabase.from("patients").select("id, vitapass_id, full_name, date_of_birth, blood_group, rh_factor, sex, organ_donor").eq("id", patientId).single(),
    supabase.from("allergies").select("allergen_name").eq("patient_id", patientId).eq("status", "active"),
    supabase.from("medications").select("medication_name, dosage").eq("patient_id", patientId).eq("status", "active"),
    supabase.from("chronic_conditions").select("condition_name").eq("patient_id", patientId).eq("status", "active"),
    supabase.from("surgeries").select("procedure_name").eq("patient_id", patientId),
    supabase.from("implants_and_devices").select("device_name").eq("patient_id", patientId).eq("status", "active"),
    supabase.from("emergency_contacts").select("full_name, phone_number").eq("patient_id", patientId).eq("is_active", true).order("priority").limit(2),
    supabase.from("life_threatening_diagnoses").select("diagnosis_name").eq("patient_id", patientId).eq("is_active", true),
  ]);
  const failed = [patientResult, allergyResult, medicationResult, conditionResult, surgeryResult, implantResult, contactResult, diagnosisResult].find((result) => result.error);
  if (failed?.error) throw new DataAccessError(classifyDatabaseError(failed.error));
  const patient = patientResult.data;
  if (!patient) throw new DataAccessError("not_found");
  return {
    id: patient.id,
    vitapassId: patient.vitapass_id,
    fullName: patient.full_name,
    dateOfBirth: patient.date_of_birth,
    bloodGroup: patient.blood_group ?? "",
    rhFactor: patient.rh_factor ?? "",
    sex: patient.sex,
    organDonor: patient.organ_donor,
    allergies: (allergyResult.data ?? []).map((row) => row.allergen_name),
    medications: (medicationResult.data ?? []).map((row) => `${row.medication_name} — ${row.dosage}`),
    conditions: (conditionResult.data ?? []).map((row) => row.condition_name),
    surgeries: (surgeryResult.data ?? []).map((row) => row.procedure_name),
    implants: (implantResult.data ?? []).map((row) => row.device_name),
    emergencyContacts: (contactResult.data ?? []).map((row) => ({ name: row.full_name, phone: row.phone_number })),
    diagnoses: (diagnosisResult.data ?? []).map((row) => row.diagnosis_name),
  };
}
