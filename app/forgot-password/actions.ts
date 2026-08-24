"use server";

import { z } from "zod";
import { isPlatformEmailBlocked } from "@/lib/dal/email-blocklist";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { recoveryPortals } from "@/app/authentication/recovery";

export type ForgotPasswordState = {
  status: "idle" | "sent" | "invalid" | "rate_limited" | "unavailable";
};

const requestSchema = z.object({
  email: z.email().max(254),
  portal: z.enum(recoveryPortals),
});

export async function requestPasswordResetAction(
  _previousState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const input = requestSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { status: "invalid" };

  try {
    // Match the normal success response so the blocklist cannot be enumerated.
    if (await isPlatformEmailBlocked(input.data.email)) return { status: "sent" };
  } catch {
    return { status: "unavailable" };
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { status: "unavailable" };
  }

  const callback = new URL("/auth/confirm", getSiteUrl());
  callback.searchParams.set("flow", "recovery");
  callback.searchParams.set("portal", input.data.portal);
  const { error } = await supabase.auth.resetPasswordForEmail(input.data.email, {
    redirectTo: callback.toString(),
  });

  if (error?.status === 429) return { status: "rate_limited" };
  if (error) return { status: "unavailable" };

  // Supabase deliberately returns the same result for unknown email addresses.
  return { status: "sent" };
}
