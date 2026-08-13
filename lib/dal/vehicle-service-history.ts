import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";
import type { GarageVehicle } from "./garage";

export type ServiceRecordPart = {
  description: string;
  partNumber: string | null;
  quantity: number;
  warrantyExpiresOn: string | null;
};
export type MaintenanceRecommendation = {
  description: string;
  dueOn: string | null;
  dueMileageKm: number | null;
  completedAt?: string | null;
};
export type VehicleServiceRecord = {
  id: string | null;
  bookingId?: string;
  completedAt?: string;
  workshopName?: string;
  serviceName?: string;
  vehicleRegistration?: string;
  vehicleVin?: string | null;
  mileageKm: number | null;
  workSummary: string | null;
  inspectionSummary: string | null;
  invoiceNumber: string | null;
  invoiceIssuedOn: string | null;
  invoiceTotalCents: number | null;
  invoiceCurrency: "EUR" | "RON" | "HUF" | null;
  parts: ServiceRecordPart[];
  recommendations: MaintenanceRecommendation[];
};

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadManagedVehicleServiceRecords() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_managed_vehicle_service_records");
  if (error) fail(error);
  return new Map(((data ?? []) as Record<string, unknown>[]).map((row) => [
    row.booking_id as string,
    row.service_record as VehicleServiceRecord | null,
  ]));
}

export async function saveWorkshopVehicleServiceRecord(input: {
  bookingId: string;
  mileageKm: number | null;
  workSummary: string | null;
  inspectionSummary: string | null;
  invoiceNumber: string | null;
  invoiceIssuedOn: string | null;
  invoiceTotalCents: number | null;
  invoiceCurrency: "EUR" | "RON" | "HUF" | null;
  parts: ServiceRecordPart[];
  recommendations: MaintenanceRecommendation[];
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_workshop_vehicle_service_record", {
    requested_booking_id: input.bookingId,
    requested_mileage_km: input.mileageKm,
    requested_work_summary: input.workSummary,
    requested_inspection_summary: input.inspectionSummary,
    requested_invoice_number: input.invoiceNumber,
    requested_invoice_issued_on: input.invoiceIssuedOn,
    requested_invoice_total_cents: input.invoiceTotalCents,
    requested_invoice_currency: input.invoiceCurrency,
    requested_parts: input.parts,
    requested_recommendations: input.recommendations,
  });
  if (error) fail(error);
}

export async function loadMyVehicleServiceHistory(vehicleId: string): Promise<{
  vehicle: GarageVehicle;
  records: VehicleServiceRecord[];
}> {
  const supabase = await createClient();
  const [{ data: vehicle, error: vehicleError }, { data, error }] = await Promise.all([
    supabase.from("vehicles")
      .select("id, registration_number, vin, make, model, production_year, engine_description, fuel_type, current_mileage_km, nickname")
      .eq("id", vehicleId).maybeSingle(),
    supabase.rpc("get_my_vehicle_service_history", { requested_vehicle_id: vehicleId }),
  ]);
  if (vehicleError || !vehicle) fail(vehicleError ?? { code: "P0002" });
  if (error) fail(error);
  return {
    vehicle: {
      id: vehicle.id,
      registrationNumber: vehicle.registration_number,
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      productionYear: vehicle.production_year,
      engineDescription: vehicle.engine_description,
      fuelType: vehicle.fuel_type,
      currentMileageKm: vehicle.current_mileage_km,
      nickname: vehicle.nickname,
    },
    records: ((data ?? []) as Record<string, unknown>[])
      .map((row) => row.service_record as VehicleServiceRecord),
  };
}
