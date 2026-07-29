export type ClinicianStatus = "pending" | "approved" | "suspended" | "rejected";
export type DoctorRouteState =
  | "unauthenticated"
  | "pending"
  | "suspended"
  | "unauthorized"
  | "approved";

export function classifyDoctorAccess(input: {
  authenticatedUserId?: string;
  clinicianAuthUserId?: string;
  verificationStatus?: ClinicianStatus;
}): DoctorRouteState {
  if (!input.authenticatedUserId) return "unauthenticated";
  if (
    !input.clinicianAuthUserId ||
    input.clinicianAuthUserId !== input.authenticatedUserId
  ) {
    return "unauthorized";
  }
  if (input.verificationStatus === "approved") return "approved";
  if (input.verificationStatus === "pending") return "pending";
  if (input.verificationStatus === "suspended") return "suspended";
  return "unauthorized";
}

export type AccessGrant = {
  status: "pending" | "active" | "revoked" | "expired";
  canView: boolean;
  canEdit: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
};

export function grantAllows(
  grant: AccessGrant | undefined,
  mode: "view" | "edit",
  now = new Date(),
) {
  if (!grant || grant.status !== "active" || grant.revokedAt) return false;
  if (grant.expiresAt && new Date(grant.expiresAt) <= now) return false;
  return mode === "edit" ? grant.canView && grant.canEdit : grant.canView;
}
