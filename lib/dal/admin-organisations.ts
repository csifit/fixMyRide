import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type AdminOrganisationWorkflow = {
  providers: Array<{
    id: string;
    legalName: string;
    displayName: string;
    mainEmail: string | null;
    countryCode: string;
    status: string;
    createdAt: string;
    billingProfile: {
      billingEmail: string | null;
      billingContact: string | null;
      taxIdentifier: string | null;
      vatIdentifier: string | null;
      registrationNumber: string | null;
      addressLine1: string | null;
      addressLine2: string | null;
      city: string | null;
      postalCode: string | null;
      countryCode: string;
    };
    canDelete: boolean;
    deleteBlockers: Array<"locations" | "managers" | "invoices" | "stripe">;
  }>;
  workshops: Array<{
    id: string;
    providerId: string | null;
    displayName: string;
    status: string;
    city: string | null;
    address: string | null;
    countryCode: string;
    latitude: number | null;
    longitude: number | null;
    publicPhone: string | null;
    publicEmail: string | null;
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
    workshopId: string | null;
    promotionalTrialDays: 60 | 90 | null;
    expiresAt: string;
    createdAt: string;
  }>;
};

type AdminWorkshopClaimStateRow = {
  workshop_id: string;
  creation_source: AdminOrganisationWorkflow["workshops"][number]["creationSource"];
  claim_status: AdminOrganisationWorkflow["workshops"][number]["claimStatus"];
};

type AdminWorkshopLocationDetailRow = {
  workshop_id: string;
  service_provider_id: string | null;
  display_name: string;
  status: string;
  city: string | null;
  practice_address: string | null;
  country_code: string;
  latitude: number | string | null;
  longitude: number | string | null;
  public_phone: string | null;
  public_email: string | null;
};

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadAdminOrganisationWorkflow(): Promise<AdminOrganisationWorkflow> {
  const supabase = await createClient();
  const [
    { data, error },
    { data: claimRows, error: claimError },
    { data: unownedRows, error: unownedError },
    { data: locationRows, error: locationError },
    { data: providerRows, error: providerError },
    { data: trialInvitationRows, error: trialInvitationError },
  ] = await Promise.all([
    supabase.rpc("get_admin_organisation_workflow"),
    supabase.rpc("get_admin_workshop_claim_states"),
    supabase.rpc("get_admin_unowned_workshops"),
    supabase.rpc("get_admin_workshop_location_details"),
    supabase.rpc("get_admin_service_provider_details"),
    supabase.rpc("get_admin_promotional_trial_invitations"),
  ]);
  if (error || !data) fail(error ?? {});
  if (claimError) fail(claimError);
  if (unownedError) fail(unownedError);
  if (locationError) fail(locationError);
  if (providerError) fail(providerError);
  if (trialInvitationError) fail(trialInvitationError);
  const workflow = data as unknown as AdminOrganisationWorkflow;
  workflow.providers = (providerRows ?? []) as unknown as AdminOrganisationWorkflow["providers"];
  const trialInvitationById = new Map(
    ((trialInvitationRows ?? []) as Array<{
      invitation_id: string;
      workshop_id: string;
      workshop_name: string;
      promotional_trial_days: 60 | 90;
    }>).map((row) => [row.invitation_id, row]),
  );
  workflow.invitations = workflow.invitations.map((invitation) => {
    const trial = trialInvitationById.get(invitation.id);
    return {
      ...invitation,
      workshopId: trial?.workshop_id ?? null,
      workshopName: trial?.workshop_name ?? invitation.workshopName,
      promotionalTrialDays: trial?.promotional_trial_days ?? null,
    };
  });
  for (const row of (unownedRows ?? []) as Array<Record<string, unknown>>) {
    workflow.workshops.push({
      id: row.workshop_id as string,
      providerId: null,
      displayName: row.display_name as string,
      status: row.status as string,
      city: row.city as string | null,
      address: row.practice_address as string | null,
      countryCode: row.country_code as string,
      latitude: null,
      longitude: null,
      publicPhone: null,
      publicEmail: null,
      primaryManagerId: null,
      primaryManagerName: null,
      subscriptionStatus: row.subscription_status as string,
      creationSource: "administrator",
      claimStatus: "unclaimed",
    });
  }
  const locationByWorkshop = new Map(
    ((locationRows ?? []) as AdminWorkshopLocationDetailRow[])
      .map((row) => [row.workshop_id, row]),
  );
  workflow.workshops = workflow.workshops.map((workshop) => {
    const location = locationByWorkshop.get(workshop.id);
    return {
      ...workshop,
      latitude: location?.latitude == null ? null : Number(location.latitude),
      longitude: location?.longitude == null ? null : Number(location.longitude),
      publicPhone: location?.public_phone ?? null,
      publicEmail: location?.public_email ?? null,
      city: location?.city ?? workshop.city,
      address: location?.practice_address ?? workshop.address,
      countryCode: location?.country_code ?? workshop.countryCode,
      displayName: location?.display_name ?? workshop.displayName,
      status: location?.status ?? workshop.status,
    };
  });
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
  workshopId: string; promotionalTrialDays: 60 | 90;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_admin_service_organisation_invitation", {
    requested_legal_name: input.legalName,
    requested_display_name: input.displayName,
    requested_country_code: input.countryCode,
    requested_email: input.email,
    requested_token_digest: input.tokenDigest,
    requested_expires_at: input.expiresAt,
    requested_workshop_id: input.workshopId,
    requested_trial_days: input.promotionalTrialDays,
  });
  if (error || !data) fail(error ?? {});
  return data as unknown as {
    serviceProviderId: string;
    invitationId: string;
    workshopName: string;
    promotionalTrialDays: 60 | 90;
  };
}

export async function resendAdminOrganisationInvitation(input: {
  invitationId: string; tokenDigest: string; expiresAt: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "resend_admin_service_organisation_invitation",
    {
      requested_invitation_id: input.invitationId,
      requested_token_digest: input.tokenDigest,
      requested_expires_at: input.expiresAt,
    },
  );
  if (error || !data) fail(error ?? {});
  return data as unknown as {
    invitationId: string;
    serviceProviderId: string;
    email: string;
    providerName: string;
  };
}

export async function createAdminWorkshopLocation(input: {
  providerId: string | null; displayName: string; countryCode: string;
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

export async function updateAdminWorkshopLocation(input: {
  workshopId: string; displayName: string; countryCode: string;
  city: string; address: string; latitude: number; longitude: number;
  publicPhone: string | null; publicEmail: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_admin_workshop_location", {
    requested_workshop_id: input.workshopId,
    requested_display_name: input.displayName,
    requested_country_code: input.countryCode,
    requested_city: input.city,
    requested_address: input.address,
    requested_latitude: input.latitude,
    requested_longitude: input.longitude,
    requested_public_phone: input.publicPhone,
    requested_public_email: input.publicEmail,
  });
  if (error) console.error("update_admin_workshop_location", { code: error.code });
  if (error) fail(error);
}

export async function updateAdminServiceProvider(input: {
  providerId: string; legalName: string; displayName: string;
  mainEmail: string | null; countryCode: string;
  billingEmail: string | null; billingContact: string | null;
  taxIdentifier: string | null; vatIdentifier: string | null;
  registrationNumber: string | null;
  addressLine1: string | null; addressLine2: string | null;
  city: string | null; postalCode: string | null;
  billingCountryCode: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_admin_service_provider", {
    requested_service_provider_id: input.providerId,
    requested_legal_name: input.legalName,
    requested_display_name: input.displayName,
    requested_main_email: input.mainEmail,
    requested_country_code: input.countryCode,
    requested_billing_email: input.billingEmail,
    requested_billing_contact: input.billingContact,
    requested_tax_identifier: input.taxIdentifier,
    requested_vat_identifier: input.vatIdentifier,
    requested_registration_number: input.registrationNumber,
    requested_address_line1: input.addressLine1,
    requested_address_line2: input.addressLine2,
    requested_city: input.city,
    requested_postal_code: input.postalCode,
    requested_billing_country_code: input.billingCountryCode,
  });
  if (error) console.error("update_admin_service_provider", { code: error.code });
  if (error) fail(error);
}

export async function assignAdminWorkshopServiceProvider(
  providerId: string, workshopId: string,
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_admin_workshop_service_provider", {
    requested_service_provider_id: providerId,
    requested_workshop_id: workshopId,
  });
  if (error) fail(error);
}

export async function setAdminServiceProviderStatus(
  providerId: string, status: "active" | "suspended", reason: string,
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_admin_service_provider_status", {
    requested_provider_id: providerId,
    requested_status: status,
    requested_reason: reason,
  });
  if (error) fail(error);
}

export async function deleteAdminServiceProvider(
  providerId: string, confirmation: string, reason: string,
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_admin_service_provider", {
    requested_service_provider_id: providerId,
    requested_confirmation: confirmation,
    requested_reason: reason,
  });
  if (error) fail(error);
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
