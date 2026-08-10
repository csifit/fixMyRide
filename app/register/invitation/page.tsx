import { createHash } from "node:crypto";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import InvitationRegistrationClient from "./InvitationRegistrationClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function InvitationRegistrationPage({ searchParams }: {
  searchParams: Promise<{ id?: string; token?: string }>;
}) {
  const { id, token } = await searchParams;
  if (!id || !token) return <Invalid />;
  const invitation = await loadInvitation(id, token);
  if (!invitation) return <Invalid />;
  return <InvitationRegistrationClient invitation={invitation} />;
}

async function loadInvitation(id: string, token: string) {
  try {
    const digest = createHash("sha256").update(token).digest("hex");
    const { data, error } = await createServiceClient()
      .from("service_provider_invitations")
      .select("id, email, invitation_kind, status, expires_at, service_providers(display_name), workshops(display_name)")
      .eq("id", id).eq("token_digest", digest).maybeSingle();
    if (error || !data || data.status !== "pending" || new Date(data.expires_at).getTime() <= Date.now()) return null;
    const provider = data.service_providers as unknown as { display_name: string } | null;
    const workshop = data.workshops as unknown as { display_name: string } | null;
    if (!provider) return null;
    return { id: data.id, token, email: data.email, kind: data.invitation_kind, providerName: provider.display_name, workshopName: workshop?.display_name ?? null };
  } catch { return null; }
}

function Invalid() {
  return <main className="registration-shell"><section className="registration-card"><h1>Invitation unavailable</h1><p>This invitation is invalid, expired, or has already been used.</p><Link href="/">Return to pitster</Link></section></main>;
}
