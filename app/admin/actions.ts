"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { classifyLoginError, type LoginErrorKind } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createPlatformDoctorInvitation, updateAdminDoctor } from "@/lib/dal/admin-doctors";
import { DataAccessError } from "@/lib/dal/errors";
import { sendInvitationEmail } from "@/lib/email/invitation";
import { getSiteUrl } from "@/lib/site-url";

export type AdminLoginState = {
  error: LoginErrorKind | "configuration" | null;
};

export type AdminDoctorInvitationState = {
  status: "idle" | "created" | "created_email_failed" | "invalid" | "duplicate" | "unauthorized" | "unavailable";
  link?: string;
};

export type AdminDoctorUpdateState = {
  status: "idle" | "saved" | "invalid" | "duplicate" | "unauthorized" | "unavailable";
};

const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(256),
});

export async function adminLoginAction(
  _previousState: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
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
  redirect("/admin/login");
}

export async function adminLogoutAction() {
  const supabase = await createClient();
  await supabase.rpc("record_auth_audit", {
    auth_action: "sign_out",
    request_correlation_id: crypto.randomUUID(),
  });
  await supabase.auth.signOut();
  redirect("/admin/login");
}

export async function setAccountingAccessAction(formData: FormData) {
  const input = z.object({ administratorId: z.uuid(), enabled: z.enum(["true", "false"]) }).safeParse({
    administratorId: formData.get("administratorId"), enabled: formData.get("enabled"),
  });
  if (!input.success) return;
  const supabase = await createClient();
  await supabase.rpc("set_administrator_accounting_access", {
    requested_administrator_id: input.data.administratorId,
    new_accounting_access: input.data.enabled === "true",
  });
  revalidatePath("/admin");
}

const doctorInvitationSchema = z.object({
  email: z.email().max(320),
  freeAccessMonths: z.enum(["0", "3", "6", "12"]),
  language: z.enum(["en", "de", "ro", "hu"]),
});

export async function createAdminDoctorInvitationAction(
  _state: AdminDoctorInvitationState,
  formData: FormData,
): Promise<AdminDoctorInvitationState> {
  const input = doctorInvitationSchema.safeParse({
    email: formData.get("email"),
    freeAccessMonths: formData.get("freeAccessMonths"),
    language: formData.get("language"),
  });
  if (!input.success) return { status: "invalid" };
  try {
    const email = input.data.email.toLowerCase();
    const months = Number(input.data.freeAccessMonths) as 0 | 3 | 6 | 12;
    const token = await createPlatformDoctorInvitation(email, months);
    const link = `/register/doctor?invitation=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
    const sent = await sendInvitationEmail({
      to: email,
      kind: "platform_doctor",
      language: input.data.language,
      invitationUrl: `${getSiteUrl()}${link}`,
    });
    revalidatePath("/admin");
    revalidatePath("/admin/doctors");
    return { status: sent ? "created" : "created_email_failed", link };
  } catch (error) {
    if (error instanceof DataAccessError) {
      if (error.code === "conflict") return { status: "duplicate" };
      if (error.code === "unauthorized") return { status: "unauthorized" };
      if (error.code === "invalid_input") return { status: "invalid" };
    }
    return { status: "unavailable" };
  }
}

const doctorUpdateSchema = z.object({
  clinicianId: z.uuid(),
  fullName: z.string().trim().min(2).max(160),
  specialty: z.string().trim().min(2).max(120),
  clinicName: z.string().trim().min(2).max(160),
  clinicCountry: z.string().trim().regex(/^[A-Za-z]{2}$/),
  professionalIdentifier: z.string().trim().min(3).max(80),
  verificationStatus: z.enum(["pending", "approved", "suspended", "rejected"]),
  statusReason: z.string().trim().max(500),
});

export async function updateAdminDoctorAction(
  _state: AdminDoctorUpdateState,
  formData: FormData,
): Promise<AdminDoctorUpdateState> {
  const input = doctorUpdateSchema.safeParse({
    clinicianId: formData.get("clinicianId"),
    fullName: formData.get("fullName"),
    specialty: formData.get("specialty"),
    clinicName: formData.get("clinicName"),
    clinicCountry: formData.get("clinicCountry"),
    professionalIdentifier: formData.get("professionalIdentifier"),
    verificationStatus: formData.get("verificationStatus"),
    statusReason: formData.get("statusReason") ?? "",
  });
  if (!input.success) return { status: "invalid" };
  try {
    await updateAdminDoctor({
      ...input.data,
      clinicCountry: input.data.clinicCountry.toUpperCase(),
    });
    revalidatePath("/admin");
    revalidatePath("/admin/doctors");
    return { status: "saved" };
  } catch (error) {
    if (error instanceof DataAccessError) {
      if (error.code === "conflict") return { status: "duplicate" };
      if (error.code === "unauthorized") return { status: "unauthorized" };
      if (error.code === "invalid_input") return { status: "invalid" };
    }
    return { status: "unavailable" };
  }
}
