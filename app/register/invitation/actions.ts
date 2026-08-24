"use server";

import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isPlatformEmailBlocked } from "@/lib/dal/email-blocklist";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type InvitationRegistrationState = {
  status: "idle" | "invalid" | "already_registered" | "rate_limited" | "unavailable";
};
const schema = z.object({
  invitationId: z.uuid(), token: z.string().min(30).max(100),
  email: z.email().max(254), fullName: z.string().trim().min(2).max(160),
});

export async function registerInvitationAction(
  _state: InvitationRegistrationState,
  formData: FormData,
): Promise<InvitationRegistrationState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  const digest = createHash("sha256").update(parsed.data.token).digest("hex");
  const password = randomBytes(48).toString("base64url");
  try {
    const service = createServiceClient();
    const { data: invitation, error: invitationError } = await service
      .from("service_provider_invitations")
      .select("id, email, status, expires_at")
      .eq("id", parsed.data.invitationId)
      .eq("token_digest", digest)
      .maybeSingle();
    if (invitationError) {
      logRegistrationFailure("invitation_lookup", invitationError);
      return { status: "unavailable" };
    }
    if (!invitation || invitation.status !== "pending"
      || invitation.email !== parsed.data.email.toLowerCase()
      || new Date(invitation.expires_at).getTime() <= Date.now()) return { status: "invalid" };
    if (await isPlatformEmailBlocked(invitation.email)) return { status: "invalid" };

    const supabase = await createClient();
    const { error: creationError } = await service.auth.admin.createUser({
      email: invitation.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: parsed.data.fullName,
        service_provider_invitation_id: invitation.id,
        service_provider_invitation_digest: digest,
      },
    });
    if (creationError?.status === 429) return { status: "rate_limited" };
    if (["user_already_exists", "email_exists", "user_already_registered"].includes(creationError?.code ?? "")) {
      return { status: "already_registered" };
    }
    if (creationError) {
      logRegistrationFailure("account_creation", creationError);
      return { status: "unavailable" };
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: invitation.email,
      password,
    });
    if (signInError) {
      logRegistrationFailure("account_sign_in", signInError);
      return { status: "unavailable" };
    }
  } catch (error) {
    logRegistrationFailure("unexpected", error);
    return { status: "unavailable" };
  }

  redirect("/register/set-password");
}

function logRegistrationFailure(stage: string, error: unknown) {
  const details = error && typeof error === "object"
    ? error as { code?: unknown; status?: unknown }
    : null;
  console.error("invitation_registration_failed", {
    stage,
    code: typeof details?.code === "string" ? details.code : undefined,
    status: typeof details?.status === "number" ? details.status : undefined,
  });
}
