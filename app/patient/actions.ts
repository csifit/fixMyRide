"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { classifyLoginError, type LoginErrorKind } from "@/lib/auth-errors";
import { DataAccessError } from "@/lib/dal/errors";
import {
  cancelMyPendingAppointment,
  createMyAppointmentChange,
} from "@/lib/dal/patient-appointments";
import { createClient } from "@/lib/supabase/server";

export type PatientLoginState = {
  error: LoginErrorKind | "configuration" | null;
  success: boolean;
};
export type PatientAppointmentActionState = {
  status: "idle" | "saved" | "invalid" | "conflict" | "unauthorized" | "unavailable";
};

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(256),
});
const cancelSchema = z.object({
  publicRequestId: z.uuid(),
  confirmed: z.literal("yes"),
});
const changeSchema = z.object({
  publicRequestId: z.uuid(),
  requestType: z.enum(["cancel", "reschedule"]),
  scheduledStart: z.union([z.literal(""), z.iso.datetime({ offset: true })]),
  slotDurationMinutes: z.union([
    z.literal(""),
    z.coerce.number().pipe(z.union([z.literal(15), z.literal(30), z.literal(45)])),
  ]),
  patientNote: z.string().trim().max(500),
  confirmed: z.literal("yes"),
});

function appointmentError(error: unknown): PatientAppointmentActionState {
  if (error instanceof DataAccessError) {
    if (error.code === "conflict") return { status: "conflict" };
    if (error.code === "unauthorized") return { status: "unauthorized" };
  }
  return { status: "unavailable" };
}

export async function patientLoginAction(
  _previous: PatientLoginState,
  formData: FormData,
): Promise<PatientLoginState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalid_credentials", success: false };
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { error: "configuration", success: false };
  }
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: classifyLoginError(error), success: false };
  const { data: claims } = await supabase.auth.getClaims();
  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("auth_user_id", claims?.claims?.sub ?? "")
    .maybeSingle();
  if (!patient) {
    await supabase.auth.signOut();
    return { error: "invalid_credentials", success: false };
  }
  return { error: null, success: true };
}

export async function patientLogoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/patient/login");
}

export async function cancelMyAppointmentRequestAction(
  _previous: PatientAppointmentActionState,
  formData: FormData,
): Promise<PatientAppointmentActionState> {
  const parsed = cancelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    await cancelMyPendingAppointment(parsed.data.publicRequestId);
    revalidatePath("/patient/appointments");
    return { status: "saved" };
  } catch (error) {
    return appointmentError(error);
  }
}

export async function createMyAppointmentChangeAction(
  _previous: PatientAppointmentActionState,
  formData: FormData,
): Promise<PatientAppointmentActionState> {
  const parsed = changeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  const reschedule = parsed.data.requestType === "reschedule";
  if (reschedule && (!parsed.data.scheduledStart || !parsed.data.slotDurationMinutes)) {
    return { status: "invalid" };
  }
  try {
    await createMyAppointmentChange({
      publicRequestId: parsed.data.publicRequestId,
      requestType: parsed.data.requestType,
      scheduledStart: reschedule ? parsed.data.scheduledStart : null,
      slotDurationMinutes: reschedule
        ? parsed.data.slotDurationMinutes as 15 | 30 | 45
        : null,
      patientNote: parsed.data.patientNote || null,
    });
    revalidatePath("/patient/appointments");
    return { status: "saved" };
  } catch (error) {
    return appointmentError(error);
  }
}
