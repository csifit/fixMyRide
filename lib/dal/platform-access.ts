import "server-only";

import { isTemporarilyUnavailable } from "@/lib/auth-errors";
import { readSupabaseEnvironment } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

type BaseFailure = { state: "configuration" | "unavailable" | "unauthenticated" | "unauthorized" };

export type CustomerAccess = BaseFailure | {
  state: "active";
  customer: { id: string; fullName: string };
} | { state: "deactivated" | "blocked" };

export type WorkshopManagerAccess = BaseFailure
  | { state: "pending" | "suspended" | "rejected" }
  | { state: "deactivated" | "blocked" }
  | { state: "active"; manager: { id: string; displayName: string } };

export type ServiceOrganisationAccess = Exclude<WorkshopManagerAccess, { state: "active" }>
  | {
    state: "active";
    manager: { id: string; displayName: string };
    organisationIds: string[];
  };

async function authenticatedUserId() {
  if (!readSupabaseEnvironment().configured) return { state: "configuration" as const };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error && isTemporarilyUnavailable(error)) return { state: "unavailable" as const };
  const userId = error ? undefined : data?.claims?.sub;
  return userId ? { state: "authenticated" as const, userId, supabase } : { state: "unauthenticated" as const };
}

export async function getCustomerAccess(): Promise<CustomerAccess> {
  const auth = await authenticatedUserId();
  if (auth.state !== "authenticated") return auth;
  const [{ data: identity, error: identityError }, { data: customer, error: customerError }] = await Promise.all([
    auth.supabase.from("account_identities").select("target_account_type, status").eq("auth_user_id", auth.userId).maybeSingle(),
    auth.supabase.from("customer_profiles").select("id, auth_user_id, full_name").eq("auth_user_id", auth.userId).maybeSingle(),
  ]);
  if (identityError || customerError) return { state: "unavailable" };
  if (identity?.target_account_type !== "customer" || !customer || customer.auth_user_id !== auth.userId) {
    return { state: "unauthorized" };
  }
  if (identity.status === "deactivated" || identity.status === "blocked") return { state: identity.status };
  return { state: "active", customer: { id: customer.id, fullName: customer.full_name } };
}

export async function getWorkshopManagerAccess(): Promise<WorkshopManagerAccess> {
  const auth = await authenticatedUserId();
  if (auth.state !== "authenticated") return auth;
  const [{ data: identity, error: identityError }, { data: manager, error: managerError }] = await Promise.all([
    auth.supabase.from("account_identities").select("target_account_type, status").eq("auth_user_id", auth.userId).maybeSingle(),
    auth.supabase.from("workshop_manager_profiles").select("id, auth_user_id, display_name, status").eq("auth_user_id", auth.userId).maybeSingle(),
  ]);
  if (identityError || managerError) return { state: "unavailable" };
  if (identity?.target_account_type !== "workshop_manager" || !manager || manager.auth_user_id !== auth.userId) {
    return { state: "unauthorized" };
  }
  if (identity.status === "deactivated" || identity.status === "blocked") return { state: identity.status };
  if (manager.status === "pending") return { state: "pending" };
  if (manager.status === "suspended") return { state: "suspended" };
  if (manager.status !== "active") return { state: "rejected" };
  return { state: "active", manager: { id: manager.id, displayName: manager.display_name } };
}

export async function getServiceOrganisationAccess(): Promise<ServiceOrganisationAccess> {
  const access = await getWorkshopManagerAccess();
  if (access.state !== "active") return access;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workshop_manager_memberships")
    .select("service_provider_id")
    .eq("workshop_manager_id", access.manager.id)
    .eq("membership_role", "owner")
    .eq("status", "active");
  if (error) return { state: "unavailable" };
  const organisationIds = (data ?? []).map((membership) => membership.service_provider_id);
  if (!organisationIds.length) return { state: "unauthorized" };
  return { state: "active", manager: access.manager, organisationIds };
}
