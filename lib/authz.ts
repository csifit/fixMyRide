export type AdministratorRole = "superadmin" | "admin" | "manager";
export type AdministratorStatus = "active" | "suspended";
export type AdminRouteState =
  | "unauthenticated"
  | "unauthorized"
  | "suspended"
  | "mfa_required"
  | "authorized";

export function classifyAdminAccess(input: {
  authenticatedUserId?: string;
  administratorAuthUserId?: string;
  role?: AdministratorRole;
  status?: AdministratorStatus;
  assuranceLevel?: string;
}): AdminRouteState {
  if (!input.authenticatedUserId) return "unauthenticated";
  if (
    !input.administratorAuthUserId ||
    input.administratorAuthUserId !== input.authenticatedUserId ||
    (input.role !== "superadmin" && input.role !== "admin")
  ) {
    return "unauthorized";
  }
  if (input.status !== "active") return "suspended";
  if (input.assuranceLevel !== "aal2") return "mfa_required";
  return "authorized";
}

export type AdminMfaDiscoveryState =
  | "security_error"
  | "enrollment_required"
  | "challenge_required";

export function classifyAdminMfaDiscovery(input: {
  lookupSucceeded: boolean;
  verifiedTotpCount?: number;
}): AdminMfaDiscoveryState {
  if (!input.lookupSucceeded) return "security_error";
  return (input.verifiedTotpCount ?? 0) > 0
    ? "challenge_required"
    : "enrollment_required";
}
