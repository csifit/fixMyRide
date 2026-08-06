import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type ManagedServiceProvider = {
  id: string;
  legalName: string;
  displayName: string;
  countryCode: string;
  status: string;
  membershipRole: string;
  workshops: Array<{ id: string; displayName: string; city: string | null; status: string }>;
};

export async function loadManagedServiceProviders(managerId: string): Promise<ManagedServiceProvider[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workshop_manager_memberships")
    .select("membership_role, status, service_providers(id, legal_name, display_name, country_code, status, workshops(id, display_name, city, status))")
    .eq("workshop_manager_id", managerId)
    .eq("status", "active");
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).flatMap((item) => {
    const provider = item.service_providers as Record<string, unknown> | null;
    if (!provider) return [];
    return [{
      id: provider.id as string,
      legalName: provider.legal_name as string,
      displayName: provider.display_name as string,
      countryCode: provider.country_code as string,
      status: provider.status as string,
      membershipRole: item.membership_role as string,
      workshops: ((provider.workshops ?? []) as Record<string, unknown>[]).map((workshop) => ({
        id: workshop.id as string,
        displayName: workshop.display_name as string,
        city: workshop.city as string | null,
        status: workshop.status as string,
      })),
    }];
  });
}
