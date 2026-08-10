import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type CommercialAdminData = {
  counts: { providers: number; locations: number; activeSubscriptions: number; attention: number; monthlyRecurringCents: number };
  locations: Array<{ id: string; providerId: string; providerName: string; providerStatus: string; displayName: string; city: string | null; workshopStatus: string; subscriptionStatus: string; coverageGraceEndsAt: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; monthlyPriceCents: number; currency: string; invoiceCount: number; lastInvoiceStatus: string | null }>;
};

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadCommercialAdmin(): Promise<CommercialAdminData> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_provider_commercial_admin");
  if (error) fail(error);
  return data as unknown as CommercialAdminData;
}

export async function setAdminServiceProviderStatus(providerId: string, status: "pending" | "active" | "suspended" | "rejected", reason: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_admin_service_provider_status", {
    requested_provider_id: providerId, requested_status: status, requested_reason: reason,
  });
  if (error) fail(error);
}
