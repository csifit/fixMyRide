import "server-only";

import { createClient } from "@/lib/supabase/server";
import { DataAccessError, classifyDatabaseError } from "./errors";

export type PublicWorkshop = {
  id: string;
  name: string;
  description: string | null;
  countryCode: string;
  city: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  publicPhone: string | null;
  publicEmail: string | null;
  offersPickup: boolean;
  offersCourtesyCar: boolean;
  serviceCategories: string[];
  priceFromCents: number | null;
};

export type PublicWorkshopService = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  estimatedDurationMinutes: number | null;
  priceFromCents: number | null;
  currency: string;
  requiresDiagnosis: boolean;
};

export async function searchPublicWorkshops(search = ""): Promise<PublicWorkshop[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_public_workshops", {
    requested_search: search || null,
  });
  if (error) {
    console.error("search_public_workshops", { code: error.code });
    throw new DataAccessError(classifyDatabaseError(error));
  }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.workshop_id as string,
    name: row.display_name as string,
    description: typeof row.description === "string" ? row.description : null,
    countryCode: row.country_code as string,
    city: typeof row.city === "string" ? row.city : null,
    address: typeof row.practice_address === "string" ? row.practice_address : null,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    publicPhone: typeof row.public_phone === "string" ? row.public_phone : null,
    publicEmail: typeof row.public_email === "string" ? row.public_email : null,
    offersPickup: Boolean(row.offers_pickup),
    offersCourtesyCar: Boolean(row.offers_courtesy_car),
    serviceCategories: Array.isArray(row.service_categories)
      ? row.service_categories as string[]
      : [],
    priceFromCents: row.price_from_cents == null ? null : Number(row.price_from_cents),
  }));
}

export async function getPublicWorkshop(workshopId: string) {
  const workshops = await searchPublicWorkshops("");
  return workshops.find((workshop) => workshop.id === workshopId) ?? null;
}

export async function loadPublicWorkshopServices(
  workshopId: string,
): Promise<PublicWorkshopService[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_workshop_services", {
    requested_workshop_id: workshopId,
  });
  if (error) {
    console.error("get_public_workshop_services", { code: error.code });
    throw new DataAccessError(classifyDatabaseError(error));
  }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.service_id as string,
    name: row.name as string,
    category: row.category as string,
    description: typeof row.description === "string" ? row.description : null,
    estimatedDurationMinutes: row.estimated_duration_minutes == null
      ? null
      : Number(row.estimated_duration_minutes),
    priceFromCents: row.price_from_cents == null ? null : Number(row.price_from_cents),
    currency: row.currency as string,
    requiresDiagnosis: Boolean(row.requires_diagnosis),
  }));
}

export async function createPublicServiceBookingRequest(input: {
  workshopId: string;
  serviceId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  vehicleRegistration: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  mileageKm: number | null;
  preferredStart: string;
  alternateStart: string | null;
  customerNote: string | null;
  mobilityRequirement: "none" | "pickup" | "courtesy_car" | "wait_on_site";
  locale: "en" | "de" | "ro" | "hu";
  managementTokenDigest: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_public_service_booking_request", {
    requested_workshop_id: input.workshopId,
    requested_service_id: input.serviceId,
    requested_customer_name: input.customerName,
    requested_customer_phone: input.customerPhone,
    requested_customer_email: input.customerEmail,
    requested_vehicle_registration: input.vehicleRegistration,
    requested_vehicle_make: input.vehicleMake,
    requested_vehicle_model: input.vehicleModel,
    requested_vehicle_year: input.vehicleYear,
    requested_mileage_km: input.mileageKm,
    requested_preferred_start: input.preferredStart,
    requested_alternate_start: input.alternateStart,
    requested_customer_note: input.customerNote,
    requested_mobility_requirement: input.mobilityRequirement,
    requested_locale: input.locale,
    requested_management_token_digest: input.managementTokenDigest,
  });
  if (error) {
    console.error("create_public_service_booking_request", { code: error.code });
    throw new DataAccessError(classifyDatabaseError(error));
  }
  return data as string;
}
