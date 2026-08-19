import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type CustomerInvoicingPreference = {
  providerId: string;
  providerName: string;
  providerDefaultEnabled: boolean;
  workshopId: string;
  workshopName: string;
  workshopOverrideEnabled: boolean | null;
  effectiveEnabled: boolean;
  canManageProvider: boolean;
};

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadCustomerInvoicingPreferences(): Promise<CustomerInvoicingPreference[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_customer_invoicing_preferences");
  if (error) fail(error);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    providerId: row.provider_id as string,
    providerName: row.provider_name as string,
    providerDefaultEnabled: Boolean(row.provider_default_enabled),
    workshopId: row.workshop_id as string,
    workshopName: row.workshop_name as string,
    workshopOverrideEnabled: row.workshop_override_enabled === null
      ? null
      : Boolean(row.workshop_override_enabled),
    effectiveEnabled: Boolean(row.effective_enabled),
    canManageProvider: Boolean(row.can_manage_provider),
  }));
}

export async function updateProviderCustomerInvoicingPreference(providerId: string, enabled: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_provider_customer_invoicing_preference", {
    requested_provider_id: providerId,
    new_enabled: enabled,
  });
  if (error) fail(error);
}

export async function updateWorkshopCustomerInvoicingPreference(
  workshopId: string,
  overrideEnabled: boolean | null,
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_workshop_customer_invoicing_preference", {
    requested_workshop_id: workshopId,
    new_override_enabled: overrideEnabled,
  });
  if (error) fail(error);
}
