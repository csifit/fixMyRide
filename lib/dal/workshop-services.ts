import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type ManagedWorkshopService = {
  id: string;
  workshopId: string;
  name: string;
  category: string;
  description: string | null;
  estimatedDurationMinutes: number | null;
  priceFromCents: number | null;
  currency: string;
  requiresDiagnosis: boolean;
  active: boolean;
  displayOrder: number;
};

export type ManagedWorkshopCatalogue = {
  workshopId: string;
  serviceProviderId: string;
  workshopName: string;
  services: ManagedWorkshopService[];
};

type ServiceInput = {
  name: string;
  category: string;
  description: string | null;
  estimatedDurationMinutes: number | null;
  priceFromCents: number | null;
  currency: string;
  requiresDiagnosis: boolean;
};

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadManagedWorkshopCatalogues(): Promise<ManagedWorkshopCatalogue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_workshop_service_catalogue");
  if (error) fail(error);

  const catalogues = new Map<string, ManagedWorkshopCatalogue>();
  for (const value of data ?? []) {
    const row = value as Record<string, unknown>;
    const workshopId = row.workshop_id as string;
    const catalogue = catalogues.get(workshopId) ?? {
      workshopId,
      serviceProviderId: row.clinic_id as string,
      workshopName: row.workshop_name as string,
      services: [],
    };
    if (row.service_id) {
      catalogue.services.push({
        id: row.service_id as string,
        workshopId,
        name: row.service_name as string,
        category: row.category as string,
        description: row.description as string | null,
        estimatedDurationMinutes: row.estimated_duration_minutes === null ? null : Number(row.estimated_duration_minutes),
        priceFromCents: row.price_from_cents === null ? null : Number(row.price_from_cents),
        currency: row.currency as string,
        requiresDiagnosis: Boolean(row.requires_diagnosis),
        active: Boolean(row.active),
        displayOrder: Number(row.display_order),
      });
    }
    catalogues.set(workshopId, catalogue);
  }
  return [...catalogues.values()];
}

export async function createManagedWorkshopService(serviceProviderId: string, input: ServiceInput) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_managed_workshop_service", {
    // Temporary RPC argument compatibility until the legacy database function retires.
    requested_clinic_id: serviceProviderId,
    new_name: input.name,
    new_category: input.category,
    new_description: input.description,
    new_estimated_duration_minutes: input.estimatedDurationMinutes,
    new_price_from_cents: input.priceFromCents,
    new_currency: input.currency,
    new_requires_diagnosis: input.requiresDiagnosis,
  });
  if (error) fail(error);
}

export async function updateManagedWorkshopService(input: ServiceInput & { id: string; displayOrder: number }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_managed_workshop_service", {
    requested_service_id: input.id,
    new_name: input.name,
    new_category: input.category,
    new_description: input.description,
    new_estimated_duration_minutes: input.estimatedDurationMinutes,
    new_price_from_cents: input.priceFromCents,
    new_currency: input.currency,
    new_requires_diagnosis: input.requiresDiagnosis,
    new_display_order: input.displayOrder,
  });
  if (error) fail(error);
}

export async function setManagedWorkshopServiceActive(id: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_managed_workshop_service_active", {
    requested_service_id: id,
    new_active: active,
  });
  if (error) fail(error);
}
