"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createOrganisationManagerInvitation,
  revokeOrganisationManagerInvitation,
} from "@/lib/dal/organisation-coverage";
import { DataAccessError } from "@/lib/dal/errors";
import { getInvitationEmailContext } from "@/lib/dal/invitation-email-context";
import {
  sendInvitationEmail,
  type InvitationEmailDelivery,
} from "@/lib/email/invitation-emails";
import { getSiteUrl } from "@/lib/site-url";

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
  const token = randomBytes(32).toString("base64url");
  const tokenDigest = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  try {
    const invitationId = await createOrganisationManagerInvitation({
      ...parsed.data,
      tokenDigest,
      expiresAt,
    });
    const url = new URL("/register/invitation", getSiteUrl());
    url.searchParams.set("id", invitationId);
    url.searchParams.set("token", token);
    let emailDelivery: InvitationEmailDelivery = "failed";
    try {
      const context = await getInvitationEmailContext(invitationId);
      if (context) {
        const email = await sendInvitationEmail({
          kind: "service_organisation_location_manager",
          to: context.email,
          invitationUrl: url.toString(),
          expiresAt,
          organisationName: context.organisationName,
          workshopName: context.workshopName,
          assignmentRole: context.assignmentRole ?? parsed.data.assignmentRole,
          invitationId,
        });
        emailDelivery = email.delivery;
      }
    } catch {
      emailDelivery = "failed";
    }
    revalidatePath("/workshop-manager/organisation");
    revalidatePath("/service-organisation/managers");
    return { status: "saved", invitationUrl: url.toString(), emailDelivery };
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
