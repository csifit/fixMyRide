"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { isPlatformEmailBlocked } from "@/lib/dal/email-blocklist";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

export type PublicRegistrationType = "customer" | "workshop_manager";
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
  registrationType: z.enum(["customer", "workshop_manager"]),
  email: z.email().max(254),
  fullName: z.string().trim().min(2).max(160),
});
const customerSchema = baseSchema.extend({ registrationType: z.literal("customer") });
const workshopManagerSchema = baseSchema.extend({
  registrationType: z.literal("workshop_manager"),
  serviceProviderLegalName: z.string().trim().min(2).max(200),
  serviceProviderDisplayName: z.string().trim().min(2).max(160),
  serviceProviderCountry: z.string().trim().regex(/^[A-Za-z]{2}$/),
});
const registrationSchema = z.discriminatedUnion("registrationType", [
  customerSchema,
  workshopManagerSchema,
]);

export async function registerAction(
  _previousState: RegistrationState,
  formData: FormData,
): Promise<RegistrationState> {
  const input = registrationSchema.safeParse({
    registrationType: formData.get("registrationType"),
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    serviceProviderLegalName: formData.get("serviceProviderLegalName"),
    serviceProviderDisplayName: formData.get("serviceProviderDisplayName"),
    serviceProviderCountry: formData.get("serviceProviderCountry"),
  });
  if (!input.success) return { status: "invalid" };

  try {
    if (await isPlatformEmailBlocked(input.data.email)) return { status: "invalid" };
  } catch {
    return { status: "unavailable" };
  }

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
  if (registration.registrationType === "workshop_manager") {
    metadata.service_provider_legal_name = registration.serviceProviderLegalName;
    metadata.service_provider_display_name = registration.serviceProviderDisplayName;
    metadata.service_provider_country = registration.serviceProviderCountry.toUpperCase();
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
