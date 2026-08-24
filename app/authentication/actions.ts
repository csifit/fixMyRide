"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { classifyLoginError, type LoginErrorKind } from "@/lib/auth-errors";
import { isPlatformEmailBlocked } from "@/lib/dal/email-blocklist";
import { createClient } from "@/lib/supabase/server";

export type PlatformLoginState = { error: LoginErrorKind | "configuration" | null };

const loginSchema = z.object({
  portal: z.enum(["customer", "workshop_manager", "service_organisation"]),
  email: z.email().max(254),
  password: z.string().min(8).max(256),
});

export async function platformLoginAction(
  _state: PlatformLoginState,
  formData: FormData,
): Promise<PlatformLoginState> {
  const input = loginSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { error: "invalid_credentials" };
  try {
    if (await isPlatformEmailBlocked(input.data.email)) {
      return { error: "invalid_credentials" };
    }
  } catch {
    return { error: "unavailable" };
  }
  let supabase;
  try { supabase = await createClient(); } catch { return { error: "configuration" }; }
  const { data, error } = await supabase.auth.signInWithPassword({ email: input.data.email, password: input.data.password });
  if (error) return { error: classifyLoginError(error) };
  const { data: identity, error: identityError } = await supabase
    .from("account_identities")
    .select("status")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (identityError || !identity || identity.status !== "active") {
    await supabase.auth.signOut();
    return { error: identityError ? "unavailable" : "invalid_credentials" };
  }
  if (input.data.portal === "customer") redirect("/customer/bookings");
  const { data: manager, error: managerError } = await supabase
    .from("workshop_manager_profiles")
    .select("id")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (managerError || !manager) return { error: "unavailable" };
  const { data: ownership, error: ownershipError } = await supabase
    .from("workshop_manager_memberships")
    .select("service_provider_id")
    .eq("workshop_manager_id", manager.id)
    .eq("membership_role", "owner")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (ownershipError) return { error: "unavailable" };
  redirect(ownership ? "/service-organisation" : "/workshop-manager");
}

export async function platformLogoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
