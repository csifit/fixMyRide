"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { classifyLoginError, type LoginErrorKind } from "@/lib/auth-errors";
import { getDoctorAccess } from "@/lib/dal/auth";
import { DataAccessError } from "@/lib/dal/errors";
import {
  auditAndLoadPatientProfile,
  updateConditionNote,
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
const conditionNoteSchema = z.object({
  conditionId: z.uuid(),
  clinicalNote: z.string().trim().max(2000),
});

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
