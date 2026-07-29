import "server-only";

import {
  classifyAdminAccess,
  type AdministratorRole,
  type AdministratorStatus,
  type AdminRouteState,
} from "../authz";
import { classifyAdminMfaDiscovery } from "../authz";
import { isTemporarilyUnavailable } from "../auth-errors";
import { readSupabaseEnvironment } from "../env";
import { createClient } from "../supabase/server";

export type AdministratorContext = {
  id: string;
  authUserId: string;
  role: "superadmin";
  status: "active";
  displayName: string;
};

type AdministratorIdentityRow = {
  id: string;
  auth_user_id: string;
  role: AdministratorRole;
  status: AdministratorStatus;
  display_name: string;
};

export type AdminAccessResult =
  | { state: "configuration" }
  | { state: "unavailable" }
  | { state: Exclude<AdminRouteState, "authorized"> }
  | { state: "authorized"; administrator: AdministratorContext };

export async function getAdminAccess(): Promise<AdminAccessResult> {
  if (!readSupabaseEnvironment().configured) return { state: "configuration" };

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError && isTemporarilyUnavailable(claimsError)) {
    return { state: "unavailable" };
  }
  const claims = claimsError ? undefined : claimsData?.claims;
  const authenticatedUserId =
    typeof claims?.sub === "string" ? claims.sub : undefined;
  if (!authenticatedUserId) return { state: "unauthenticated" };

  const { data, error } = await supabase
    .rpc("get_my_administrator_identity")
    .maybeSingle();
  if (error) return { state: "unavailable" };
  const administrator = data as AdministratorIdentityRow | null;

  const state = classifyAdminAccess({
    authenticatedUserId,
    administratorAuthUserId: administrator?.auth_user_id ?? undefined,
    role: administrator?.role as AdministratorRole | undefined,
    status: administrator?.status as AdministratorStatus | undefined,
    assuranceLevel:
      typeof claims?.aal === "string" ? claims.aal : undefined,
  });
  if (state !== "authorized") return { state };
  if (!administrator) return { state: "unauthorized" };

  return {
    state,
    administrator: {
      id: administrator.id,
      authUserId: authenticatedUserId,
      role: "superadmin",
      status: "active",
      displayName: administrator.display_name,
    },
  };
}

export async function getAdminMfaDestination() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  const state = classifyAdminMfaDiscovery({
    lookupSucceeded: !error,
    verifiedTotpCount: data?.totp.length,
  });
  if (state === "security_error") {
    return { state } as const;
  }
  if (state === "challenge_required") {
    return {
      state,
      destination: "/admin/mfa/challenge",
      factorId: data!.totp[0].id,
    } as const;
  }
  return {
    state,
    destination: "/admin/mfa/enroll",
  } as const;
}
