"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { classifyLoginError, type LoginErrorKind } from "@/lib/auth-errors";
import { getDoctorAccess } from "@/lib/dal/auth";
import { DataAccessError } from "@/lib/dal/errors";
import {
  auditAndLoadPatientProfile,
  createLifeThreateningDiagnosis,
  deactivateLifeThreateningDiagnosis,
  reactivateLifeThreateningDiagnosis,
  readSensitiveIdentifiers,
  updateHealthCardProfile,
  updateLifeThreateningDiagnosis,
  updateConditionNote,
  updateSensitiveIdentifiers,
} from "@/lib/dal/doctor";
import type {
  HealthCardProfileUpdate,
  SensitiveIdentifiers,
} from "@/lib/dal/doctor";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  error: LoginErrorKind | "configuration" | null;
};
export type ConditionNoteState = {
  status: "idle" | "saved" | "unauthorized" | "unavailable";
};

const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(256),
});
const patientViewSchema = z.object({ patientId: z.uuid() });
const sensitiveIdentifierReadSchema = z.object({ patientId: z.uuid() });
const conditionNoteSchema = z.object({
  conditionId: z.uuid(),
  clinicalNote: z.string().trim().max(2000),
});
const nullableText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => value || null);
const healthCardProfileSchema = z.object({
  patientId: z.uuid(),
  familyName: nullableText(100),
  givenNames: nullableText(140),
  insuranceStatus: z.enum([
    "unknown",
    "insured",
    "uninsured",
    "verification_pending",
  ]),
  insuranceVerificationSource: z.enum([
    "not_verified",
    "cnas_manual_check",
    "health_card",
    "supporting_document",
    "clinician_attestation",
  ]),
  insuranceHouseCode: nullableText(40),
  insuranceHouseName: nullableText(160),
  familyDoctorName: nullableText(160),
  familyDoctorProfessionalCode: nullableText(80),
  familyDoctorTelephone: nullableText(40),
});
const sensitiveIdentifierUpdateSchema = z.object({
  patientId: z.uuid(),
  cnp: z.union([z.literal(""), z.string().regex(/^[0-9]{13}$/)]).transform(
    (value) => value || null,
  ),
  insuranceNumber: nullableText(80),
  healthCardNumber: nullableText(80),
  healthCardExpiresAt: z
    .union([z.literal(""), z.iso.date()])
    .transform((value) => value || null),
});
const diagnosisSchema = z.object({
  patientId: z.uuid(),
  diagnosisId: z.union([z.literal(""), z.uuid()]).optional(),
  name: z.string().trim().min(2).max(240),
  codeSystem: z.enum(["icd10", "snomed_ct", "other"]),
  code: z.string().trim().min(1).max(80),
  otherCodeSystemName: nullableText(120),
});
const deactivateDiagnosisSchema = z.object({
  diagnosisId: z.uuid(),
  confirmed: z.literal("yes"),
});
const reactivateDiagnosisSchema = z.object({ diagnosisId: z.uuid() });

export async function loginAction(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const input = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!input.success) return { error: "invalid_credentials" };

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { error: "configuration" };
  }

  const { error } = await supabase.auth.signInWithPassword(input.data);
  if (error) return { error: classifyLoginError(error) };

  await supabase.rpc("record_auth_audit", {
    auth_action: "sign_in",
    request_correlation_id: crypto.randomUUID(),
  });
  redirect("/doctor");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.rpc("record_auth_audit", {
    auth_action: "sign_out",
    request_correlation_id: crypto.randomUUID(),
  });
  await supabase.auth.signOut();
  redirect("/doctor/login");
}

export async function viewPatientProfileAction(patientId: string) {
  const input = patientViewSchema.safeParse({ patientId });
  if (!input.success) {
    return { ok: false as const, error: "unauthorized" as const };
  }
  const access = await getDoctorAccess();
  if (access.state !== "approved") {
    return {
      ok: false as const,
      error:
        access.state === "unavailable"
          ? "unavailable" as const
          : "unauthorized" as const,
    };
  }
  try {
    await auditAndLoadPatientProfile(input.data.patientId);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof DataAccessError && error.code === "unauthorized"
          ? "unauthorized" as const
          : "unavailable" as const,
    };
  }
}

export async function updateConditionNoteAction(
  _previousState: ConditionNoteState,
  formData: FormData,
): Promise<ConditionNoteState> {
  const input = conditionNoteSchema.safeParse({
    conditionId: formData.get("conditionId"),
    clinicalNote: formData.get("clinicalNote"),
  });
  if (!input.success) return { status: "unauthorized" };
  const access = await getDoctorAccess();
  if (access.state !== "approved") {
    return {
      status:
        access.state === "unavailable" ? "unavailable" : "unauthorized",
    };
  }
  try {
    await updateConditionNote(input.data.conditionId, input.data.clinicalNote);
    revalidatePath("/doctor");
    return { status: "saved" };
  } catch (error) {
    // The form intentionally exposes no database or medical error details.
    return {
      status:
        error instanceof DataAccessError && error.code === "unauthorized"
          ? "unauthorized"
          : "unavailable",
    };
  }
}

export type SensitiveIdentifierReadResult =
  | { ok: true; identifiers: SensitiveIdentifiers }
  | { ok: false; error: "unauthorized" | "unavailable" };
export type HealthDataMutationState = {
  status:
    | "idle"
    | "saved"
    | "unauthorized"
    | "unavailable"
    | "invalid"
    | "duplicate";
};

function mutationErrorState(error: unknown): HealthDataMutationState {
  if (error instanceof DataAccessError) {
    if (error.code === "unauthorized") return { status: "unauthorized" };
    if (error.code === "invalid_input") return { status: "invalid" };
    if (error.code === "conflict") return { status: "duplicate" };
  }
  return { status: "unavailable" };
}

export async function readSensitiveIdentifiersAction(
  patientId: string,
): Promise<SensitiveIdentifierReadResult> {
  const input = sensitiveIdentifierReadSchema.safeParse({ patientId });
  if (!input.success) {
    return { ok: false, error: "unauthorized" };
  }

  const access = await getDoctorAccess();
  if (access.state !== "approved") {
    return {
      ok: false,
      error:
        access.state === "unavailable" ? "unavailable" : "unauthorized",
    };
  }

  try {
    return {
      ok: true,
      identifiers: await readSensitiveIdentifiers(input.data.patientId),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof DataAccessError && error.code === "unauthorized"
          ? "unauthorized"
          : "unavailable",
    };
  }
}

export async function updateHealthCardProfileAction(
  _previousState: HealthDataMutationState,
  formData: FormData,
): Promise<HealthDataMutationState> {
  const input = healthCardProfileSchema.safeParse({
    patientId: formData.get("patientId"),
    familyName: formData.get("familyName"),
    givenNames: formData.get("givenNames"),
    insuranceStatus: formData.get("insuranceStatus"),
    insuranceVerificationSource:
      formData.get("insuranceVerificationSource"),
    insuranceHouseCode: formData.get("insuranceHouseCode"),
    insuranceHouseName: formData.get("insuranceHouseName"),
    familyDoctorName: formData.get("familyDoctorName"),
    familyDoctorProfessionalCode:
      formData.get("familyDoctorProfessionalCode"),
    familyDoctorTelephone: formData.get("familyDoctorTelephone"),
  });
  if (!input.success) return { status: "invalid" };
  const { patientId, ...profile } = input.data;
  try {
    await updateHealthCardProfile(
      patientId,
      profile as HealthCardProfileUpdate,
    );
    revalidatePath("/doctor");
    return { status: "saved" };
  } catch (error) {
    return mutationErrorState(error);
  }
}

export async function updateSensitiveIdentifiersAction(
  _previousState: HealthDataMutationState,
  formData: FormData,
): Promise<HealthDataMutationState> {
  const input = sensitiveIdentifierUpdateSchema.safeParse({
    patientId: formData.get("patientId"),
    cnp: formData.get("cnp"),
    insuranceNumber: formData.get("insuranceNumber"),
    healthCardNumber: formData.get("healthCardNumber"),
    healthCardExpiresAt: formData.get("healthCardExpiresAt"),
  });
  if (!input.success) return { status: "invalid" };
  const { patientId, ...identifiers } = input.data;
  try {
    await updateSensitiveIdentifiers(patientId, identifiers);
    revalidatePath("/doctor");
    return { status: "saved" };
  } catch (error) {
    return mutationErrorState(error);
  }
}

export async function createLifeThreateningDiagnosisAction(
  _previousState: HealthDataMutationState,
  formData: FormData,
): Promise<HealthDataMutationState> {
  const input = diagnosisSchema.safeParse({
    patientId: formData.get("patientId"),
    name: formData.get("name"),
    codeSystem: formData.get("codeSystem"),
    code: formData.get("code"),
    otherCodeSystemName: formData.get("otherCodeSystemName"),
  });
  if (!input.success) return { status: "invalid" };
  const { patientId, name, codeSystem, code, otherCodeSystemName } = input.data;
  try {
    await createLifeThreateningDiagnosis(
      patientId,
      { name, codeSystem, code, otherCodeSystemName },
    );
    revalidatePath("/doctor");
    return { status: "saved" };
  } catch (error) {
    return mutationErrorState(error);
  }
}

export async function updateLifeThreateningDiagnosisAction(
  _previousState: HealthDataMutationState,
  formData: FormData,
): Promise<HealthDataMutationState> {
  const input = diagnosisSchema.safeParse({
    patientId: formData.get("patientId"),
    diagnosisId: formData.get("diagnosisId"),
    name: formData.get("name"),
    codeSystem: formData.get("codeSystem"),
    code: formData.get("code"),
    otherCodeSystemName: formData.get("otherCodeSystemName"),
  });
  if (!input.success || !input.data.diagnosisId) {
    return { status: "invalid" };
  }
  const { diagnosisId, name, codeSystem, code, otherCodeSystemName } = input.data;
  try {
    await updateLifeThreateningDiagnosis(
      diagnosisId,
      { name, codeSystem, code, otherCodeSystemName },
    );
    revalidatePath("/doctor");
    return { status: "saved" };
  } catch (error) {
    return mutationErrorState(error);
  }
}

export async function deactivateLifeThreateningDiagnosisAction(
  _previousState: HealthDataMutationState,
  formData: FormData,
): Promise<HealthDataMutationState> {
  const input = deactivateDiagnosisSchema.safeParse({
    diagnosisId: formData.get("diagnosisId"),
    confirmed: formData.get("confirmed"),
  });
  if (!input.success) return { status: "invalid" };
  try {
    await deactivateLifeThreateningDiagnosis(input.data.diagnosisId);
    revalidatePath("/doctor");
    return { status: "saved" };
  } catch (error) {
    return mutationErrorState(error);
  }
}

export async function reactivateLifeThreateningDiagnosisAction(
  _previousState: HealthDataMutationState,
  formData: FormData,
): Promise<HealthDataMutationState> {
  const input = reactivateDiagnosisSchema.safeParse({
    diagnosisId: formData.get("diagnosisId"),
  });
  if (!input.success) return { status: "invalid" };
  try {
    await reactivateLifeThreateningDiagnosis(input.data.diagnosisId);
    revalidatePath("/doctor");
    return { status: "saved" };
  } catch (error) {
    return mutationErrorState(error);
  }
}
