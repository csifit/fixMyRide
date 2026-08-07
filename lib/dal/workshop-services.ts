import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";
import type { AutomotiveVehicleType, ServiceBookingMode } from "@/lib/automotive-service-catalogue";

export type ManagedWorkshopService = {
  id: string;
  serviceCode: string | null;
  workshopId: string;
  name: string;
  category: string;
  description: string | null;
  vehicleType: AutomotiveVehicleType;
  bookingMode: ServiceBookingMode;
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
  serviceCode: string | null;
  vehicleType: AutomotiveVehicleType;
  bookingMode: ServiceBookingMode;
  estimatedDurationMinutes: number | null;
  priceFromCents: number | null;
  currency: string;
};

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadManagedWorkshopCatalogues(): Promise<ManagedWorkshopCatalogue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_workshop_service_catalogue_v3");
  if (error) fail(error);

  const catalogues = new Map<string, ManagedWorkshopCatalogue>();
  for (const value of data ?? []) {
    const row = value as Record<string, unknown>;
    const workshopId = row.workshop_id as string;
    const catalogue = catalogues.get(workshopId) ?? {
      workshopId,
      serviceProviderId: row.service_provider_id as string,
      workshopName: row.workshop_name as string,
      services: [],
    };
    if (row.service_id) {
      catalogue.services.push({
        id: row.service_id as string,
        serviceCode: row.service_code as string | null,
        workshopId,
        name: row.service_name as string,
        category: row.category as string,
        description: row.description as string | null,
        vehicleType: row.vehicle_type as AutomotiveVehicleType,
        bookingMode: row.booking_mode as ServiceBookingMode,
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

export async function createManagedWorkshopService(workshopId: string, input: ServiceInput) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_managed_workshop_service_v3", {
    requested_workshop_id: workshopId,
    new_service_code: input.serviceCode,
    new_name: input.name,
    new_category: input.category,
    new_description: input.description,
    new_vehicle_type: input.vehicleType,
    new_booking_mode: input.bookingMode,
    new_estimated_duration_minutes: input.estimatedDurationMinutes,
    new_price_from_cents: input.priceFromCents,
    new_currency: input.currency,
  });
  if (error) fail(error);
}

export async function updateManagedWorkshopService(input: ServiceInput & { id: string; displayOrder: number }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_managed_workshop_service_v3", {
    requested_service_id: input.id,
    new_name: input.name,
    new_category: input.category,
    new_description: input.description,
    new_vehicle_type: input.vehicleType,
    new_booking_mode: input.bookingMode,
    new_estimated_duration_minutes: input.estimatedDurationMinutes,
    new_price_from_cents: input.priceFromCents,
    new_currency: input.currency,
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
