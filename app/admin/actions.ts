"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { classifyLoginError, type LoginErrorKind } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/server";

export type AdminLoginState = {
  error: LoginErrorKind | "configuration" | null;
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
  try { supabase = await createClient(); }
  catch { return { error: "configuration" }; }
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
