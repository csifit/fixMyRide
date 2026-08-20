import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createOrganisationManagerInvitation } from "@/lib/dal/organisation-coverage";
import { getInvitationEmailContext } from "@/lib/dal/invitation-email-context";
import {
  sendInvitationEmail,
  type InvitationEmailDelivery,
} from "@/lib/email/invitation-emails";
import { getSiteUrl } from "@/lib/site-url";

export type LocationManagerInvitationResult = {
  invitationId: string;
  invitationUrl: string;
  emailDelivery: InvitationEmailDelivery;
};

export async function createAndDeliverLocationManagerInvitation(input: {
  workshopId: string;
  email: string;
  assignmentRole: "primary_manager" | "manager";
}): Promise<LocationManagerInvitationResult> {
  const token = randomBytes(32).toString("base64url");
  const tokenDigest = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const invitationId = await createOrganisationManagerInvitation({
    ...input,
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
        assignmentRole: context.assignmentRole ?? input.assignmentRole,
        invitationId,
      });
      emailDelivery = email.delivery;
    }
  } catch {
    emailDelivery = "failed";
  }

  return {
    invitationId,
    invitationUrl: url.toString(),
    emailDelivery,
  };
}
