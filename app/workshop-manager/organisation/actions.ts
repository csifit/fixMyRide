"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { revokeOrganisationManagerInvitation } from "@/lib/dal/organisation-coverage";
import { DataAccessError } from "@/lib/dal/errors";
import type { InvitationEmailDelivery } from "@/lib/email/invitation-emails";
import { createAndDeliverLocationManagerInvitation } from "@/lib/location-manager-invitations";

export type OrganisationInvitationState = {
  status: "idle" | "saved" | "revoked" | "invalid" | "duplicate" | "unauthorized" | "unavailable";
  invitationUrl?: string;
  emailDelivery?: InvitationEmailDelivery;
};

function failure(error: unknown): OrganisationInvitationState {
  if (error instanceof DataAccessError) {
    if (error.code === "unauthorized") return { status: "unauthorized" };
    if (error.code === "conflict") return { status: "duplicate" };
    if (error.code === "invalid_input" || error.code === "not_found") {
      return { status: "invalid" };
    }
  }
  return { status: "unavailable" };
}

const invitationSchema = z.object({
  workshopId: z.uuid(),
  email: z.email().max(254),
  assignmentRole: z.enum(["primary_manager", "manager"]),
});

export async function inviteOrganisationManagerAction(
  _state: OrganisationInvitationState,
  formData: FormData,
): Promise<OrganisationInvitationState> {
  const parsed = invitationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    const invitation = await createAndDeliverLocationManagerInvitation(parsed.data);
    revalidatePath("/workshop-manager/organisation");
    revalidatePath("/service-organisation/managers");
    return {
      status: "saved",
      invitationUrl: invitation.invitationUrl,
      emailDelivery: invitation.emailDelivery,
    };
  } catch (error) {
    return failure(error);
  }
}

const revokeSchema = z.object({ invitationId: z.uuid() });

export async function revokeOrganisationManagerInvitationAction(
  _state: OrganisationInvitationState,
  formData: FormData,
): Promise<OrganisationInvitationState> {
  const parsed = revokeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    await revokeOrganisationManagerInvitation(parsed.data.invitationId);
    revalidatePath("/workshop-manager/organisation");
    revalidatePath("/service-organisation/managers");
    return { status: "revoked" };
  } catch (error) {
    return failure(error);
  }
}
