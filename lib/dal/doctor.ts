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
import { classifyDatabaseError, DataAccessError } from "./errors";

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
  family_name: string | null;
  given_names: string | null;
  date_of_birth: string;
  sex: string;
  insurance_status: "unknown" | "insured" | "uninsured" | "verification_pending";
  insurance_verification_source:
    | "not_verified"
    | "cnas_manual_check"
    | "health_card"
    | "supporting_document"
    | "clinician_attestation";
  insurance_verified_at: string | null;
  insurance_house_code: string | null;
  insurance_house_name: string | null;
  family_doctor_name: string | null;
  family_doctor_professional_code: string | null;
  family_doctor_telephone: string | null;
  profile_verified_at: string | null;
  profile_verified_by_name: string | null;
  profile_verified_by_code: string | null;
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

type EmergencyContactRow = {
  id: string;
  full_name: string;
  relationship_key: string;
  phone_number: string;
};

type LifeThreateningDiagnosisRow = {
  id: string;
  diagnosis_name: string;
  code_system: "icd10" | "snomed_ct" | "other";
  diagnosis_code: string;
  code_system_other_name: string | null;
  verified_at: string;
  verified_by_name: string;
  verified_by_code: string;
};

type PatientProfile = {
  patient: PatientRow;
  conditions: ConditionRow[];
  allergies: AllergyRow[];
  medications: MedicationRow[];
  emergency_contacts: EmergencyContactRow[];
  life_threatening_diagnoses: LifeThreateningDiagnosisRow[];
  inactive_life_threatening_diagnoses: LifeThreateningDiagnosisRow[];
};

export type SensitiveIdentifiers = {
  cnp: string | null;
  insuranceNumber: string | null;
  healthCardNumber: string | null;
  healthCardExpiresAt: string | null;
  verifiedAt: string | null;
  verifiedByName: string | null;
  verifiedByCode: string | null;
};

export type HealthCardProfileUpdate = {
  familyName: string | null;
  givenNames: string | null;
  insuranceStatus: NonNullable<DoctorPatientSummary["insuranceStatus"]>;
  insuranceVerificationSource: NonNullable<
    DoctorPatientSummary["insuranceVerificationSource"]
  >;
  insuranceHouseCode: string | null;
  insuranceHouseName: string | null;
  familyDoctorName: string | null;
  familyDoctorProfessionalCode: string | null;
  familyDoctorTelephone: string | null;
};

export type LifeThreateningDiagnosisUpdate = {
  name: string;
  codeSystem: "icd10" | "snomed_ct" | "other";
  code: string;
  otherCodeSystemName: string | null;
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
  emergencyContacts: EmergencyContactRow[],
  lifeThreateningDiagnoses: LifeThreateningDiagnosisRow[],
  inactiveLifeThreateningDiagnoses: LifeThreateningDiagnosisRow[],
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
    familyName: patient.family_name,
    givenNames: patient.given_names,
    insuranceStatus: patient.insurance_status,
    insuranceVerificationSource: patient.insurance_verification_source,
    insuranceVerifiedAt: patient.insurance_verified_at,
    insuranceHouseCode: patient.insurance_house_code,
    insuranceHouseName: patient.insurance_house_name,
    familyDoctor: patient.family_doctor_name
      ? {
          name: patient.family_doctor_name,
          professionalCode: patient.family_doctor_professional_code,
          telephone: patient.family_doctor_telephone,
        }
      : null,
    emergencyContacts: emergencyContacts.slice(0, 2).map((contact) => ({
      id: contact.id,
      name: contact.full_name,
      relationship: contact.relationship_key,
      telephone: contact.phone_number,
    })),
    lifeThreateningDiagnoses: lifeThreateningDiagnoses.map((diagnosis) => ({
      id: diagnosis.id,
      name: diagnosis.diagnosis_name,
      codeSystem: diagnosis.code_system,
      code: diagnosis.diagnosis_code,
      otherCodeSystemName: diagnosis.code_system_other_name,
      verifiedAt: diagnosis.verified_at,
      verifiedByName: diagnosis.verified_by_name,
      verifiedByCode: diagnosis.verified_by_code,
    })),
    inactiveLifeThreateningDiagnoses:
      inactiveLifeThreateningDiagnoses.map((diagnosis) => ({
        id: diagnosis.id,
        name: diagnosis.diagnosis_name,
        codeSystem: diagnosis.code_system,
        code: diagnosis.diagnosis_code,
        otherCodeSystemName: diagnosis.code_system_other_name,
        verifiedAt: diagnosis.verified_at,
        verifiedByName: diagnosis.verified_by_name,
        verifiedByCode: diagnosis.verified_by_code,
      })),
    profileVerification:
      patient.profile_verified_at &&
      patient.profile_verified_by_name &&
      patient.profile_verified_by_code
        ? {
            verifiedAt: patient.profile_verified_at,
            clinicianName: patient.profile_verified_by_name,
            clinicianCode: patient.profile_verified_by_code,
          }
        : null,
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
  if (grantError) throw new DataAccessError(classifyDatabaseError(grantError));

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
  const profileError = profileResults.find(({ error }) => error)?.error;
  if (profileError) {
    throw new DataAccessError(classifyDatabaseError(profileError));
  }
  if (profileResults.some(({ data }) => !data)) {
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
      profile.emergency_contacts,
      profile.life_threatening_diagnoses,
      profile.inactive_life_threatening_diagnoses,
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
  const { data, error } = await supabase.rpc("get_patient_profile", {
    requested_patient_id: patientId,
    request_correlation_id: crypto.randomUUID(),
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  if (!data) throw new DataAccessError("unauthorized");
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
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}

export async function readSensitiveIdentifiers(
  patientId: string,
): Promise<SensitiveIdentifiers> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "read_patient_sensitive_identifiers",
    {
      requested_patient_id: patientId,
      request_correlation_id: crypto.randomUUID(),
    },
  );
  if (error) throw new DataAccessError(classifyDatabaseError(error));

  const identifiers = data as {
    cnp?: string | null;
    insurance_number?: string | null;
    health_card_number?: string | null;
    health_card_expires_at?: string | null;
    verified_at?: string | null;
    verified_by_name?: string | null;
    verified_by_code?: string | null;
  } | null;
  if (!identifiers) throw new DataAccessError("unavailable");

  return {
    cnp: identifiers.cnp ?? null,
    insuranceNumber: identifiers.insurance_number ?? null,
    healthCardNumber: identifiers.health_card_number ?? null,
    healthCardExpiresAt: identifiers.health_card_expires_at ?? null,
    verifiedAt: identifiers.verified_at ?? null,
    verifiedByName: identifiers.verified_by_name ?? null,
    verifiedByCode: identifiers.verified_by_code ?? null,
  };
}

export async function updateSensitiveIdentifiers(
  patientId: string,
  identifiers: Omit<
    SensitiveIdentifiers,
    "verifiedAt" | "verifiedByName" | "verifiedByCode"
  >,
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "update_patient_sensitive_identifiers",
    {
      requested_patient_id: patientId,
      new_cnp: identifiers.cnp,
      new_insurance_number: identifiers.insuranceNumber,
      new_health_card_number: identifiers.healthCardNumber,
      new_health_card_expires_at: identifiers.healthCardExpiresAt,
      request_correlation_id: crypto.randomUUID(),
    },
  );
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}

export async function updateHealthCardProfile(
  patientId: string,
  profile: HealthCardProfileUpdate,
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "update_patient_health_card_profile",
    {
      requested_patient_id: patientId,
      new_family_name: profile.familyName,
      new_given_names: profile.givenNames,
      new_insurance_status: profile.insuranceStatus,
      new_insurance_verification_source:
        profile.insuranceVerificationSource,
      new_insurance_house_code: profile.insuranceHouseCode,
      new_insurance_house_name: profile.insuranceHouseName,
      new_family_doctor_name: profile.familyDoctorName,
      new_family_doctor_professional_code:
        profile.familyDoctorProfessionalCode,
      new_family_doctor_telephone: profile.familyDoctorTelephone,
      request_correlation_id: crypto.randomUUID(),
    },
  );
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}

export async function createLifeThreateningDiagnosis(
  patientId: string,
  diagnosis: LifeThreateningDiagnosisUpdate,
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "create_life_threatening_diagnosis",
    {
      requested_patient_id: patientId,
      new_diagnosis_name: diagnosis.name,
      new_code_system: diagnosis.codeSystem,
      new_diagnosis_code: diagnosis.code,
      new_code_system_other_name: diagnosis.otherCodeSystemName,
      request_correlation_id: crypto.randomUUID(),
    },
  );
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}

export async function updateLifeThreateningDiagnosis(
  diagnosisId: string,
  diagnosis: LifeThreateningDiagnosisUpdate,
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "update_life_threatening_diagnosis",
    {
      diagnosis_id: diagnosisId,
      new_diagnosis_name: diagnosis.name,
      new_code_system: diagnosis.codeSystem,
      new_diagnosis_code: diagnosis.code,
      new_code_system_other_name: diagnosis.otherCodeSystemName,
      request_correlation_id: crypto.randomUUID(),
    },
  );
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}

export async function deactivateLifeThreateningDiagnosis(
  diagnosisId: string,
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "deactivate_life_threatening_diagnosis",
    {
      diagnosis_id: diagnosisId,
      request_correlation_id: crypto.randomUUID(),
    },
  );
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}

export async function reactivateLifeThreateningDiagnosis(
  diagnosisId: string,
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "reactivate_life_threatening_diagnosis",
    {
      diagnosis_id: diagnosisId,
      request_correlation_id: crypto.randomUUID(),
    },
  );
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}
