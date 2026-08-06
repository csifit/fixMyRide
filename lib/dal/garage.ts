import "server-only";

import { createClient } from "@/lib/supabase/server";
import { DataAccessError, classifyDatabaseError } from "./errors";

export type GarageVehicle = {
  id: string;
  registrationNumber: string;
  vin: string | null;
  make: string;
  model: string;
  productionYear: number | null;
  engineDescription: string | null;
  fuelType: string | null;
  currentMileageKm: number | null;
  nickname: string | null;
};

export type GarageBooking = {
  id: string;
  vehicleRegistration: string;
  vehicleMake: string;
  vehicleModel: string;
  preferredStart: string;
  confirmedStart: string | null;
  status: string;
};

async function currentCustomerId() {
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claims?.claims?.sub) return null;
  const { data, error } = await supabase
    .from("customer_profiles")
    .select("id")
    .eq("auth_user_id", claims.claims.sub)
    .maybeSingle();
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  return data?.id as string | undefined ?? null;
}

export async function loadMyGarage() {
  const customerId = await currentCustomerId();
  if (!customerId) return { vehicles: [], bookings: [] };
  const supabase = await createClient();
  const [vehiclesResult, bookingsResult] = await Promise.all([
    supabase.from("vehicles")
      .select("id, registration_number, vin, make, model, production_year, engine_description, fuel_type, current_mileage_km, nickname")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
    supabase.from("service_booking_requests")
      .select("id, vehicle_registration, vehicle_make, vehicle_model, preferred_start, confirmed_start, status")
      .eq("customer_id", customerId)
      .order("preferred_start", { ascending: false }),
  ]);
  if (vehiclesResult.error) throw new DataAccessError(classifyDatabaseError(vehiclesResult.error));
  if (bookingsResult.error) throw new DataAccessError(classifyDatabaseError(bookingsResult.error));
  return {
    vehicles: (vehiclesResult.data ?? []).map((row) => ({
      id: row.id,
      registrationNumber: row.registration_number,
      vin: row.vin,
      make: row.make,
      model: row.model,
      productionYear: row.production_year,
      engineDescription: row.engine_description,
      fuelType: row.fuel_type,
      currentMileageKm: row.current_mileage_km,
      nickname: row.nickname,
    })) as GarageVehicle[],
    bookings: (bookingsResult.data ?? []).map((row) => ({
      id: row.id,
      vehicleRegistration: row.vehicle_registration,
      vehicleMake: row.vehicle_make,
      vehicleModel: row.vehicle_model,
      preferredStart: row.preferred_start,
      confirmedStart: row.confirmed_start,
      status: row.status,
    })) as GarageBooking[],
  };
}

export async function addMyVehicle(input: Omit<GarageVehicle, "id">) {
  const customerId = await currentCustomerId();
  if (!customerId) throw new DataAccessError("unauthorized");
  const supabase = await createClient();
  const { error } = await supabase.from("vehicles").insert({
    customer_id: customerId,
    registration_number: input.registrationNumber.toUpperCase(),
    vin: input.vin?.toUpperCase() || null,
    make: input.make,
    model: input.model,
    production_year: input.productionYear,
    engine_description: input.engineDescription,
    fuel_type: input.fuelType,
    current_mileage_km: input.currentMileageKm,
    nickname: input.nickname,
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}
