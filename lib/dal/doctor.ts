import "server-only";

import type {
  AllergyKey,
  ConditionKey,
  DoctorPatientSummary,
  DoctorPortalData,
  SexKey,
} from "@/app/demo-data";
import { grantAllows } from "../authz";
import { createClient } from "../supabase/server";
import type { ClinicianContext } from "./auth";
import { DataAccessError } from "./errors";

const conditionKeys = new Set<ConditionKey>([
  "type2Diabetes", "hypertension", "atrialFibrillation",
  "asthma", "hyperlipidemia", "hypothyroidism",
]);
const allergyKeys = new Set<AllergyKey>([
  "penicillin", "latex", "ibuprofen", "noneKnown",
]);

type GrantRow = {
  patient_id: string;
  can_view: boolean;
  can_edit: boolean;
  status: "pending" | "active" | "revoked" | "expired";
  expires_at: string | null;
  revoked_at: string | null;
  granted_at: string | null;
};

type PatientRow = {
  id: string;
  vitapass_id: string;
  full_name: string;
  date_of_birth: string;
  sex: string;
  updated_at: string;
};

type ConditionRow = {
  id: string;
  patient_id: string;
  condition_key: string | null;
  clinical_note: string | null;
};

type AllergyRow = {
  patient_id: string;
  allergen_key: string | null;
};

type MedicationRow = {
  patient_id: string;
  medication_name: string;
  dosage: string;
};

type PatientProfile = {
  patient: PatientRow;
  conditions: ConditionRow[];
  allergies: AllergyRow[];
  medications: MedicationRow[];
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function ageAt(dateOfBirth: string, now: Date) {
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() &&
      now.getUTCDate() < birth.getUTCDate())
  ) age -= 1;
  return age;
}

function mapPatient(
  patient: PatientRow,
  grant: GrantRow,
  conditions: ConditionRow[],
  allergies: AllergyRow[],
  medications: MedicationRow[],
  now: Date,
): DoctorPatientSummary {
  const activeConditions = conditions.filter(
    (row) => row.patient_id === patient.id && conditionKeys.has(row.condition_key as ConditionKey),
  );
  const activeAllergies = allergies
    .filter((row) => row.patient_id === patient.id && allergyKeys.has(row.allergen_key as AllergyKey))
    .map((row) => row.allergen_key as AllergyKey);

  return {
    id: patient.vitapass_id,
    databaseId: patient.id,
    initials: initials(patient.full_name),
    name: patient.full_name,
    age: ageAt(patient.date_of_birth, now),
    sexKey: (patient.sex === "male" ? "male" : "female") as SexKey,
    lastReview: patient.updated_at,
    statusKey: "upToDate",
    conditionKeys: activeConditions.map((row) => row.condition_key as ConditionKey),
    conditionRecords: activeConditions.map((row) => ({
      id: row.id,
      key: row.condition_key as ConditionKey,
      note: row.clinical_note ?? "",
    })),
    allergyKeys: activeAllergies.length ? activeAllergies : ["noneKnown"],
    medications: medications
      .filter((row) => row.patient_id === patient.id)
      .map((row) => ({ name: row.medication_name, dose: row.dosage })),
    access: grant.expires_at
      ? {
          kind: "temporary",
          days: Math.max(
            0,
            Math.ceil((new Date(grant.expires_at).getTime() - now.getTime()) / 86_400_000),
          ),
        }
      : { kind: "familyCareTeam" },
    canEdit: grant.can_edit,
  };
}

export async function loadDoctorDashboard(
  clinician: ClinicianContext,
): Promise<DoctorPortalData> {
  const supabase = await createClient();
  const now = new Date();
  const { data: grantData, error: grantError } = await supabase
    .from("patient_access_grants")
    .select("patient_id, can_view, can_edit, status, expires_at, revoked_at, granted_at")
    .eq("clinician_id", clinician.id)
    .eq("status", "active");
  if (grantError) throw new DataAccessError("unauthorized");

  const grants = (grantData ?? []) as GrantRow[];
  const allowedGrants = grants.filter((grant) =>
    grantAllows(
      {
        status: grant.status,
        canView: grant.can_view,
        canEdit: grant.can_edit,
        expiresAt: grant.expires_at,
        revokedAt: grant.revoked_at,
      },
      "view",
      now,
    ),
  );
  const profileResults = await Promise.all(
    allowedGrants.map((grant) =>
      supabase.rpc("get_patient_profile", {
        requested_patient_id: grant.patient_id,
        request_correlation_id: crypto.randomUUID(),
      }),
    ),
  );
  if (profileResults.some(({ data, error }) => error || !data)) {
    throw new DataAccessError("unauthorized");
  }

  const patients = profileResults.map(({ data }, index) => {
    const profile = data as PatientProfile;
    return mapPatient(
      profile.patient,
      allowedGrants[index],
      profile.conditions,
      profile.allergies,
      profile.medications,
      now,
    );
  });

  return {
    referenceTime: now.toISOString(),
    clinician: {
      name: clinician.fullName,
      initials: initials(clinician.fullName),
      specialtyKey: "familyMedicine",
      clinicName: clinician.clinicName,
      clinicCountry: clinician.clinicCountry,
    },
    metrics: {
      patientCount: patients.length,
      pendingRequestCount: 0,
      urgentRequestCount: 0,
      reviewedLastThirtyDays: 0,
    },
    patients,
    requests: [],
    activity: [],
  };
}

export async function auditAndLoadPatientProfile(patientId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("get_patient_profile", {
    requested_patient_id: patientId,
    request_correlation_id: crypto.randomUUID(),
  });
  if (error) throw new DataAccessError("unauthorized");
}

export async function updateConditionNote(
  conditionId: string,
  clinicalNote: string,
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_chronic_condition_note", {
    condition_id: conditionId,
    new_clinical_note: clinicalNote,
    request_correlation_id: crypto.randomUUID(),
  });
  if (error) throw new DataAccessError("unauthorized");
}
