import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type AdminOrganisationWorkflow = {
  workshops: Array<{
    id: string;
    providerId: string;
    displayName: string;
    status: string;
    city: string | null;
    address: string | null;
    countryCode: string;
    primaryManagerId: string | null;
    primaryManagerName: string | null;
    subscriptionStatus: string;
    creationSource: "legacy" | "administrator" | "organisation_owner";
    claimStatus: "not_applicable" | "unclaimed" | "awaiting_payment" | "claimed";
  }>;
  managers: Array<{
    id: string;
    authUserId: string;
    displayName: string;
    profileStatus: string;
    accountStatus: "active" | "deactivated" | "blocked";
    email: string;
  }>;
  accounts: Array<{
    authUserId: string;
    accountType: string;
    status: "active" | "deactivated" | "blocked";
    email: string;
    displayName: string;
    customerId: string | null;
    managerId: string | null;
  }>;
  invitations: Array<{
    id: string;
    email: string;
    kind: "organisation_owner" | "location_manager";
    status: "pending" | "accepted" | "revoked" | "expired";
    providerName: string;
    workshopName: string | null;
    expiresAt: string;
    createdAt: string;
  }>;
};

type AdminWorkshopClaimStateRow = {
  workshop_id: string;
  creation_source: AdminOrganisationWorkflow["workshops"][number]["creationSource"];
  claim_status: AdminOrganisationWorkflow["workshops"][number]["claimStatus"];
};

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadAdminOrganisationWorkflow(): Promise<AdminOrganisationWorkflow> {
  const supabase = await createClient();
  const [{ data, error }, { data: claimRows, error: claimError }] = await Promise.all([
    supabase.rpc("get_admin_organisation_workflow"),
    supabase.rpc("get_admin_workshop_claim_states"),
  ]);
  if (error || !data) fail(error ?? {});
  if (claimError) fail(claimError);
  const workflow = data as unknown as AdminOrganisationWorkflow;
  const claimByWorkshop = new Map<string, AdminWorkshopClaimStateRow>(
    ((claimRows ?? []) as AdminWorkshopClaimStateRow[])
      .map((row) => [row.workshop_id, row]),
  );
  workflow.workshops = workflow.workshops.map((workshop) => {
    const claim = claimByWorkshop.get(workshop.id);
    return {
      ...workshop,
      creationSource: claim?.creation_source ?? "legacy",
      claimStatus: claim?.claim_status ?? "not_applicable",
    };
  });
  return workflow;
}

export async function createAdminOrganisationInvitation(input: {
  legalName: string; displayName: string; countryCode: string;
  email: string; tokenDigest: string; expiresAt: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_admin_service_organisation_invitation", {
    requested_legal_name: input.legalName,
    requested_display_name: input.displayName,
    requested_country_code: input.countryCode,
    requested_email: input.email,
    requested_token_digest: input.tokenDigest,
    requested_expires_at: input.expiresAt,
  });
  if (error || !data) fail(error ?? {});
  return data as unknown as { serviceProviderId: string; invitationId: string };
}

export async function createAdminWorkshopLocation(input: {
  providerId: string; displayName: string; countryCode: string;
  city: string | null; address: string | null; latitude: number | null;
  longitude: number | null; publicPhone: string | null; publicEmail: string | null;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_admin_workshop_location", {
    requested_service_provider_id: input.providerId,
    requested_display_name: input.displayName,
    requested_country_code: input.countryCode,
    requested_city: input.city,
    requested_address: input.address,
    requested_latitude: input.latitude,
    requested_longitude: input.longitude,
    requested_public_phone: input.publicPhone,
    requested_public_email: input.publicEmail,
  });
  if (error) console.error("create_admin_workshop_location", { code: error.code });
  if (error || !data) fail(error ?? {});
  return data as string;
}

export async function createAdminLocationManagerInvitation(input: {
  workshopId: string; email: string; assignmentRole: "primary_manager" | "manager";
  tokenDigest: string; expiresAt: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_admin_location_manager_invitation", {
    requested_workshop_id: input.workshopId,
    requested_email: input.email,
    requested_assignment_role: input.assignmentRole,
    requested_token_digest: input.tokenDigest,
    requested_expires_at: input.expiresAt,
  });
  if (error || !data) fail(error ?? {});
  return data as string;
}

export async function assignAdminWorkshopManager(input: {
  workshopId: string; managerId: string; assignmentRole: "primary_manager" | "manager";
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_admin_workshop_manager", {
    requested_workshop_id: input.workshopId,
    requested_workshop_manager_id: input.managerId,
    requested_assignment_role: input.assignmentRole,
  });
  if (error) fail(error);
}

export async function setAdminPlatformAccountStatus(input: {
  authUserId: string; status: "active" | "deactivated" | "blocked"; reason: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_admin_platform_account_status", {
    requested_auth_user_id: input.authUserId,
    requested_status: input.status,
    requested_reason: input.reason,
  });
  if (error) fail(error);
}
