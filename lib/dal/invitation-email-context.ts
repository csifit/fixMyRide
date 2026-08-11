import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

export type InvitationEmailContext = {
  email: string;
  organisationName: string;
  workshopName: string | null;
  assignmentRole: "primary_manager" | "manager" | null;
};

export async function getInvitationEmailContext(
  invitationId: string,
): Promise<InvitationEmailContext | null> {
  const { data, error } = await createServiceClient()
    .from("service_provider_invitations")
    .select("email, intended_assignment_role, service_providers(display_name), workshops(display_name)")
    .eq("id", invitationId)
    .maybeSingle();
  if (error || !data) return null;

  const provider = data.service_providers as unknown as { display_name: string } | null;
  const workshop = data.workshops as unknown as { display_name: string } | null;
  if (!provider) return null;

  return {
    email: data.email,
    organisationName: provider.display_name,
    workshopName: workshop?.display_name ?? null,
    assignmentRole: data.intended_assignment_role as "primary_manager" | "manager" | null,
  };
}
