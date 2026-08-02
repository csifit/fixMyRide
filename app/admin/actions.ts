"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { classifyLoginError, type LoginErrorKind } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createPlatformDoctorInvitation, updateAdminDoctor } from "@/lib/dal/admin-doctors";
import {
  createAdminClinicLocation,
  setAdminDoctorLocationAssignment,
  updateAdminClinicLocation,
} from "@/lib/dal/admin-clinics";
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

export type AdminClinicState = {
  status: "idle" | "created" | "saved" | "invalid" | "unauthorized" | "unavailable";
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

const optionalText = (max: number) => z.string().trim().max(max);
const optionalDate = z.union([z.literal(""), z.iso.date()]).transform((value) => value || null);
const optionalCoordinate = z.union([z.literal(""), z.coerce.number()])
  .transform((value) => value === "" ? null : value);
const clinicLocationFields = {
  displayName: z.string().trim().min(2).max(160),
  countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()),
  description: optionalText(2000),
  publicPhone: optionalText(40),
  publicEmail: z.union([z.literal(""), z.email().max(320)]),
  city: optionalText(120),
  address: optionalText(240),
  latitude: optionalCoordinate.refine((value) => value === null || (value >= -90 && value <= 90)),
  longitude: optionalCoordinate.refine((value) => value === null || (value >= -180 && value <= 180)),
  locationStatus: z.enum(["pending", "active", "suspended", "rejected"]),
  activeFrom: optionalDate,
  endsBefore: optionalDate,
};
const locationPair = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) => schema.refine(
  (value) => {
    const coordinates = value as { latitude: number | null; longitude: number | null };
    return (coordinates.latitude === null) === (coordinates.longitude === null);
  },
  { path: ["latitude"] },
);
const createClinicLocationSchema = locationPair(z.object({
  clinicId: z.uuid(),
  ...clinicLocationFields,
}));
const updateClinicLocationSchema = locationPair(z.object({
  locationId: z.uuid(),
  ...clinicLocationFields,
  statusReason: z.string().trim().max(500),
}));

function clinicFormInput(formData: FormData) {
  return {
    displayName: formData.get("displayName"), countryCode: formData.get("countryCode"),
    description: formData.get("description") ?? "", publicPhone: formData.get("publicPhone") ?? "",
    publicEmail: formData.get("publicEmail") ?? "", city: formData.get("city") ?? "",
    address: formData.get("address") ?? "", latitude: formData.get("latitude") ?? "",
    longitude: formData.get("longitude") ?? "", locationStatus: formData.get("locationStatus"),
    activeFrom: formData.get("activeFrom") ?? "", endsBefore: formData.get("endsBefore") ?? "",
  };
}

function clinicFailure(error: unknown): AdminClinicState {
  if (error instanceof DataAccessError) {
    if (error.code === "unauthorized") return { status: "unauthorized" };
    if (error.code === "invalid_input" || error.code === "conflict") return { status: "invalid" };
  }
  return { status: "unavailable" };
}

function refreshClinicPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/clinics");
  revalidatePath("/");
  revalidatePath("/appointments");
}

export async function createAdminClinicLocationAction(
  _state: AdminClinicState,
  formData: FormData,
): Promise<AdminClinicState> {
  const parsed = createClinicLocationSchema.safeParse({
    clinicId: formData.get("clinicId"),
    ...clinicFormInput(formData),
  });
  if (!parsed.success) return { status: "invalid" };
  const { clinicId, locationStatus, ...location } = parsed.data;
  try {
    await createAdminClinicLocation(clinicId, { ...location, status: locationStatus });
    refreshClinicPaths();
    return { status: "created" };
  } catch (error) {
    return clinicFailure(error);
  }
}

export async function updateAdminClinicLocationAction(
  _state: AdminClinicState,
  formData: FormData,
): Promise<AdminClinicState> {
  const parsed = updateClinicLocationSchema.safeParse({
    locationId: formData.get("locationId"), statusReason: formData.get("statusReason") ?? "",
    ...clinicFormInput(formData),
  });
  if (!parsed.success) return { status: "invalid" };
  const { locationId, locationStatus, ...location } = parsed.data;
  try {
    await updateAdminClinicLocation(locationId, { ...location, status: locationStatus });
    refreshClinicPaths();
    return { status: "saved" };
  } catch (error) {
    return clinicFailure(error);
  }
}

const clinicDoctorAssignmentSchema = z.object({
  locationId: z.uuid(),
  clinicianId: z.uuid(),
  assignmentStatus: z.enum(["active", "suspended", "ended"]),
  startsOn: optionalDate,
  endsBefore: optionalDate,
});

export async function setAdminDoctorLocationAssignmentAction(
  _state: AdminClinicState,
  formData: FormData,
): Promise<AdminClinicState> {
  const parsed = clinicDoctorAssignmentSchema.safeParse({
    locationId: formData.get("locationId"), clinicianId: formData.get("clinicianId"),
    assignmentStatus: formData.get("assignmentStatus"), startsOn: formData.get("startsOn") ?? "",
    endsBefore: formData.get("endsBefore") ?? "",
  });
  if (!parsed.success) return { status: "invalid" };
  try {
    await setAdminDoctorLocationAssignment({
      locationId: parsed.data.locationId,
      clinicianId: parsed.data.clinicianId,
      status: parsed.data.assignmentStatus,
      startsOn: parsed.data.startsOn,
      endsBefore: parsed.data.endsBefore,
    });
    refreshClinicPaths();
    return { status: "saved" };
  } catch (error) {
    return clinicFailure(error);
  }
}
