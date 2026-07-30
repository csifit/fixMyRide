"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

export type PublicRegistrationType =
  | "patient"
  | "doctor"
  | "clinic_manager"
  | "staff";
export type RegistrationState = {
  status:
    | "idle"
    | "check_email"
    | "invalid"
    | "already_registered"
    | "rate_limited"
    | "unavailable";
};

const baseSchema = z.object({
  registrationType: z.enum(["patient", "doctor", "clinic_manager", "staff"]),
  email: z.email().max(254),
  fullName: z.string().trim().min(2).max(160),
});
const patientSchema = baseSchema.extend({
  registrationType: z.literal("patient"),
  dateOfBirth: z.iso.date(),
  sex: z.enum(["female", "male"]),
});
const doctorSchema = baseSchema.extend({
  registrationType: z.literal("doctor"),
  specialty: z.string().trim().min(2).max(120),
  clinicName: z.string().trim().min(2).max(160),
  clinicCountry: z.string().trim().regex(/^[A-Za-z]{2}$/),
  professionalIdentifier: z.string().trim().min(3).max(80),
  invitationToken: z.union([
    z.literal(""),
    z.string().regex(/^[a-f0-9]{64}$/),
  ]),
});
const clinicManagerSchema = baseSchema.extend({
  registrationType: z.literal("clinic_manager"),
  clinicLegalName: z.string().trim().min(2).max(200),
  clinicDisplayName: z.string().trim().min(2).max(160),
  clinicCountry: z.string().trim().regex(/^[A-Za-z]{2}$/),
});
const staffSchema = baseSchema.extend({
  registrationType: z.literal("staff"),
  invitationToken: z.string().regex(/^[a-f0-9]{64}$/),
});
const registrationSchema = z.discriminatedUnion("registrationType", [
  patientSchema,
  doctorSchema,
  clinicManagerSchema,
  staffSchema,
]);

export async function registerAction(
  _previousState: RegistrationState,
  formData: FormData,
): Promise<RegistrationState> {
  const input = registrationSchema.safeParse({
    registrationType: formData.get("registrationType"),
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    dateOfBirth: formData.get("dateOfBirth"),
    sex: formData.get("sex"),
    specialty: formData.get("specialty"),
    clinicName: formData.get("clinicName"),
    clinicCountry: formData.get("clinicCountry"),
    professionalIdentifier: formData.get("professionalIdentifier"),
    invitationToken: formData.get("invitationToken"),
    clinicLegalName: formData.get("clinicLegalName"),
    clinicDisplayName: formData.get("clinicDisplayName"),
  });
  if (!input.success) return { status: "invalid" };

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { status: "unavailable" };
  }

  const registration = input.data;
  const metadata: Record<string, string> = {
    registration_type: registration.registrationType,
    full_name: registration.fullName,
  };
  if (registration.registrationType === "patient") {
    metadata.date_of_birth = registration.dateOfBirth;
    metadata.sex = registration.sex;
  } else if (registration.registrationType === "doctor") {
    metadata.specialty = registration.specialty;
    metadata.clinic_name = registration.clinicName;
    metadata.clinic_country = registration.clinicCountry.toUpperCase();
    metadata.professional_identifier = registration.professionalIdentifier;
    if (registration.invitationToken) {
      metadata.invitation_token = registration.invitationToken;
    }
  } else if (registration.registrationType === "clinic_manager") {
    metadata.clinic_legal_name = registration.clinicLegalName;
    metadata.clinic_display_name = registration.clinicDisplayName;
    metadata.clinic_country = registration.clinicCountry.toUpperCase();
  } else {
    metadata.invitation_token = registration.invitationToken;
  }

  const temporarySecret = randomBytes(48).toString("base64url");
  const { error } = await supabase.auth.signUp({
    email: registration.email,
    password: temporarySecret,
    options: {
      data: metadata,
      emailRedirectTo: `${getSiteUrl()}/auth/confirm`,
    },
  });
  if (!error) return { status: "check_email" };
  if (error.status === 429) return { status: "rate_limited" };
  if (
    error.code === "user_already_exists" ||
    error.code === "email_exists" ||
    error.code === "user_already_registered"
  ) {
    return { status: "already_registered" };
  }
  if (error.status && error.status >= 500) return { status: "unavailable" };
  return { status: "invalid" };
}
