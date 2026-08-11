import "server-only";

import { readSupabaseEnvironment } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type SidebarIdentity = {
  displayName: string;
  email: string;
};

function claimText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function getSidebarIdentity(): Promise<SidebarIdentity | null> {
  if (!readSupabaseEnvironment().configured) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) return null;

    const claims = data.claims;
    const email = claimText(claims.email);
    if (!email) return null;
    const metadata = claims.user_metadata && typeof claims.user_metadata === "object"
      ? claims.user_metadata as Record<string, unknown>
      : {};
    const displayName = claimText(metadata.full_name)
      ?? claimText(metadata.display_name)
      ?? claimText(metadata.name)
      ?? email.split("@")[0];

    return { displayName, email };
  } catch {
    return null;
  }
}
