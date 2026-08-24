import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ProviderMfaStatus =
  | { state: "unavailable" }
  | {
      state: "ready";
      currentLevel: "aal1" | "aal2" | null;
      factor: { id: string; friendlyName: string | null } | null;
    };

export async function loadProviderMfaStatus(): Promise<ProviderMfaStatus> {
  const supabase = await createClient();
  const [factors, assurance] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (factors.error || assurance.error) return { state: "unavailable" };
  const factor = factors.data.totp[0] ?? null;
  const currentLevel = assurance.data.currentLevel === "aal2"
    ? "aal2"
    : assurance.data.currentLevel === "aal1" ? "aal1" : null;
  return {
    state: "ready",
    currentLevel,
    factor: factor ? {
      id: factor.id,
      friendlyName: factor.friendly_name ?? null,
    } : null,
  };
}

export function safeProviderNext(
  role: "workshop_manager" | "service_organisation",
  requested: string | undefined,
) {
  const root = role === "service_organisation"
    ? "/service-organisation"
    : "/workshop-manager";
  if (!requested?.startsWith(`${root}/`) && requested !== root) return root;
  if (requested.startsWith(`${root}/login`)
    || requested.startsWith(`${root}/security/mfa`)) return root;
  return requested;
}
