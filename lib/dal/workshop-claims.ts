import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type PublicWorkshopClaim = {
  workshopId: string;
  displayName: string;
  city: string | null;
  address: string | null;
  countryCode: string;
  serviceProviderName: string;
  status: "unclaimed" | "awaiting_payment" | "claimed";
};

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadPublicWorkshopClaim(workshopId: string): Promise<PublicWorkshopClaim | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_workshop_claim", {
    requested_workshop_id: workshopId,
  }).maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    workshopId: row.workshop_id as string,
    displayName: row.display_name as string,
    city: row.city as string | null,
    address: row.practice_address as string | null,
    countryCode: row.country_code as string,
    serviceProviderName: row.service_provider_name as string,
    status: row.claim_status as PublicWorkshopClaim["status"],
  };
}

export async function beginMyWorkshopClaim(workshopId: string): Promise<{
  providerId: string;
  state: "details_required" | "payment_required" | "claimed";
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("begin_my_workshop_claim", {
    requested_workshop_id: workshopId,
  });
  if (error || !data) fail(error ?? {});
  const result = data as Record<string, unknown>;
  return {
    providerId: result.providerId as string,
    state: result.state as "details_required" | "payment_required" | "claimed",
  };
}
