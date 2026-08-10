import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type OrganisationCoverage = {
  providerId: string;
  legalName: string;
  displayName: string;
  providerStatus: string;
  unitMonthlyPriceCents: number;
  currency: string;
  locationCount: number;
  coveredLocationCount: number;
  requiredMonthlyCents: number;
  locations: Array<{
    id: string;
    displayName: string;
    status: string;
    city: string | null;
    address: string | null;
    subscriptionStatus: string;
    coverageGraceEndsAt: string | null;
    currentPeriodEnd: string | null;
    coverageState: "covered" | "grace" | "attention" | "uncovered";
    primaryManagerId: string | null;
    primaryManagerName: string | null;
    primaryManagerEmail: string | null;
    primaryManagerStatus: string | null;
  }>;
  invitations: Array<{
    id: string;
    email: string;
    status: "pending" | "accepted" | "revoked";
    assignmentRole: "primary_manager" | "manager";
    workshopId: string;
    workshopName: string;
    expiresAt: string;
    createdAt: string;
  }>;
};

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadOrganisationCoverage(providerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_my_service_organisation_coverage",
    { requested_service_provider_id: providerId },
  );
  if (error) fail(error);
  if (!data) throw new DataAccessError("unavailable");
  return data as unknown as OrganisationCoverage;
}

export async function createOrganisationManagerInvitation(input: {
  workshopId: string;
  email: string;
  assignmentRole: "primary_manager" | "manager";
  tokenDigest: string;
  expiresAt: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "create_my_location_manager_invitation",
    {
      requested_workshop_id: input.workshopId,
      requested_email: input.email,
      requested_assignment_role: input.assignmentRole,
      requested_token_digest: input.tokenDigest,
      requested_expires_at: input.expiresAt,
    },
  );
  if (error || !data) fail(error ?? {});
  return data as string;
}

export async function revokeOrganisationManagerInvitation(invitationId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "revoke_my_location_manager_invitation",
    { requested_invitation_id: invitationId },
  );
  if (error) fail(error);
}
