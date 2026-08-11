"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type PasswordSetupState = {
  status:
    | "idle"
    | "invalid"
    | "unauthorized"
    | "rate_limited"
    | "unavailable";
};

const passwordSchema = z.object({
  password: z.string().min(8).max(256),
  confirmPassword: z.string().min(8).max(256),
});

const destinations: Record<string, string> = {
  customer: "/customer/bookings",
  workshop_manager: "/workshop-manager",
  independent_service_provider: "/service-provider",
  workshop_staff: "/workshop-staff",
  platform_manager: "/admin",
  platform_admin: "/admin",
  superadmin: "/admin",
};

export async function setPasswordAction(
  _previousState: PasswordSetupState,
  formData: FormData,
): Promise<PasswordSetupState> {
  const input = passwordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
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
  const authUserId = claimsError ? null : claims?.claims?.sub;
  if (!authUserId) return { status: "unauthorized" };

  const { error: passwordError } = await supabase.auth.updateUser({
    password: input.data.password,
  });
  if (passwordError?.status === 429) return { status: "rate_limited" };
  if (passwordError) return { status: "unavailable" };

  const { data: identity, error: identityError } = await supabase
    .from("account_identities")
    .select("target_account_type")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (identityError || !identity?.target_account_type) {
    return { status: "unavailable" };
  }

  if (identity.target_account_type === "workshop_manager") {
    const { data: manager, error: managerError } = await supabase
      .from("workshop_manager_profiles")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (managerError || !manager) return { status: "unavailable" };
    const { data: ownership, error: ownershipError } = await supabase
      .from("workshop_manager_memberships")
      .select("service_provider_id")
      .eq("workshop_manager_id", manager.id)
      .eq("membership_role", "owner")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (ownershipError) return { status: "unavailable" };
    redirect(ownership ? "/service-organisation" : "/workshop-manager");
  }

  redirect(destinations[identity.target_account_type] ?? "/");
}
