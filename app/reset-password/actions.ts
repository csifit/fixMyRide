"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recoveryPortals } from "@/app/authentication/recovery";

export type ResetPasswordState = {
  status: "idle" | "success" | "invalid" | "unauthorized" | "rate_limited" | "unavailable";
};

const resetSchema = z.object({
  password: z.string().min(8).max(256),
  confirmPassword: z.string().min(8).max(256),
  portal: z.enum(recoveryPortals),
});

export async function resetPasswordAction(
  _previousState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const input = resetSchema.safeParse(Object.fromEntries(formData));
  if (!input.success || input.data.password !== input.data.confirmPassword) {
    return { status: "invalid" };
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { status: "unavailable" };
  }

  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claims?.claims?.sub) return { status: "unauthorized" };

  const { error } = await supabase.auth.updateUser({
    password: input.data.password,
  });
  if (error?.status === 429) return { status: "rate_limited" };
  if (error) return { status: "unavailable" };

  await supabase.auth.signOut({ scope: "global" });
  return { status: "success" };
}
