import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

export type InvitationEmailContext = {
  email: string;
  organisationName: string;
  workshopName: string | null;
  assignmentRole: "primary_manager" | "manager" | null;
  promotionalTrialDays: 60 | 90 | null;
};

export async function getInvitationEmailContext(
  invitationId: string,
): Promise<InvitationEmailContext | null> {
  const { data, error } = await createServiceClient()
    .from("service_provider_invitations")
    .select("email, intended_assignment_role, promotional_trial_days, service_providers(display_name), manager_workshop:workshops!service_provider_invitations_workshop_id_fkey(display_name), claim_workshop:workshops!service_provider_invitations_claim_workshop_id_fkey(display_name)")
    .eq("id", invitationId)
    .maybeSingle();
  if (error || !data) return null;

  const provider = data.service_providers as unknown as { display_name: string } | null;
  const managerWorkshop = data.manager_workshop as unknown as { display_name: string } | null;
  const claimWorkshop = data.claim_workshop as unknown as { display_name: string } | null;
  if (!provider) return null;

  return {
    email: data.email,
    organisationName: provider.display_name,
    workshopName: claimWorkshop?.display_name ?? managerWorkshop?.display_name ?? null,
    assignmentRole: data.intended_assignment_role as "primary_manager" | "manager" | null,
    promotionalTrialDays: data.promotional_trial_days as 60 | 90 | null,
  };
}
