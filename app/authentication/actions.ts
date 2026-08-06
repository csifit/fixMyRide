"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { classifyLoginError, type LoginErrorKind } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/server";

export type PlatformLoginState = { error: LoginErrorKind | "configuration" | null };

const loginSchema = z.object({
  portal: z.enum(["customer", "workshop_manager"]),
  email: z.email().max(254),
  password: z.string().min(8).max(256),
});

export async function platformLoginAction(
  _state: PlatformLoginState,
  formData: FormData,
): Promise<PlatformLoginState> {
  const input = loginSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { error: "invalid_credentials" };
  let supabase;
  try { supabase = await createClient(); } catch { return { error: "configuration" }; }
  const { error } = await supabase.auth.signInWithPassword({ email: input.data.email, password: input.data.password });
  if (error) return { error: classifyLoginError(error) };
  redirect(input.data.portal === "customer" ? "/customer/bookings" : "/workshop-manager");
}

export async function platformLogoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
