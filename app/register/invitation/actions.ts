"use server";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getSiteUrl } from "@/lib/site-url";

export type InvitationRegistrationState = {
  status: "idle" | "check_email" | "invalid" | "already_registered" | "rate_limited" | "unavailable";
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
  try {
    const service = createServiceClient();
    const { data: invitation, error: invitationError } = await service
      .from("service_provider_invitations")
      .select("id, email, status, expires_at")
      .eq("id", parsed.data.invitationId)
      .eq("token_digest", digest)
      .maybeSingle();
    if (invitationError) return { status: "unavailable" };
    if (!invitation || invitation.status !== "pending"
      || invitation.email !== parsed.data.email.toLowerCase()
      || new Date(invitation.expires_at).getTime() <= Date.now()) return { status: "invalid" };

    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
      email: invitation.email,
      password: randomBytes(48).toString("base64url"),
      options: {
        data: {
          full_name: parsed.data.fullName,
          service_provider_invitation_id: invitation.id,
          service_provider_invitation_digest: digest,
        },
        emailRedirectTo: `${getSiteUrl()}/auth/confirm`,
      },
    });
    if (!error) return { status: "check_email" };
    if (error.status === 429) return { status: "rate_limited" };
    if (["user_already_exists", "email_exists", "user_already_registered"].includes(error.code ?? "")) {
      return { status: "already_registered" };
    }
    return error.status && error.status >= 500 ? { status: "unavailable" } : { status: "invalid" };
  } catch { return { status: "unavailable" }; }
}
