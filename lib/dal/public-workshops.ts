import "server-only";

import { createClient } from "@/lib/supabase/server";
import { DataAccessError, classifyDatabaseError } from "./errors";
import type { AutomotiveVehicleType, ServiceBookingMode } from "@/lib/automotive-service-catalogue";

export type PublicWorkshop = {
  id: string;
  slug: string;
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
  serviceCode: string | null;
  name: string;
  category: string;
  description: string | null;
  vehicleType: AutomotiveVehicleType;
  bookingMode: ServiceBookingMode;
  estimatedDurationMinutes: number | null;
  priceFromCents: number | null;
  currency: string;
  requiresDiagnosis: boolean;
  diagnosisFeeCents: number | null;
  diagnosisCurrency: string | null;
};

export type PublicWorkshopBookingRules = {
  minimumLeadMinutes: number;
  bookingHorizonDays: number;
  slotIntervalMinutes: number;
  offersPickup: boolean;
  offersCourtesyCar: boolean;
  allowsWaitOnSite: boolean;
  timeZone: string;
  earliestBookingDate: string;
  latestBookingDate: string;
  operatingHours: Array<{ weekday: number; opensAt: string | null; closesAt: string | null; closed: boolean }>;
  closures: Array<{ startsAt: string; endsAt: string }>;
};

export async function searchPublicWorkshops(search = "", serviceCode?: string): Promise<PublicWorkshop[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_public_workshops_v3", {
    requested_search: search || null,
    requested_service_code: serviceCode || null,
  });
  if (error) {
    console.error("search_public_workshops", { code: error.code });
    throw new DataAccessError(classifyDatabaseError(error));
  }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.workshop_id as string,
    slug: row.workshop_slug as string,
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

export async function getPublicWorkshop(workshopReference: string) {
  const workshops = await searchPublicWorkshops("");
  return workshops.find((workshop) =>
    workshop.id === workshopReference || workshop.slug === workshopReference
  ) ?? null;
}

export async function loadPublicWorkshopServices(
  workshopId: string,
): Promise<PublicWorkshopService[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_workshop_services_v2", {
    requested_workshop_id: workshopId,
  });
  if (error) {
    console.error("get_public_workshop_services", { code: error.code });
    throw new DataAccessError(classifyDatabaseError(error));
  }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.service_id as string,
    serviceCode: row.service_code as string | null,
    name: row.name as string,
    category: row.category as string,
    description: typeof row.description === "string" ? row.description : null,
    vehicleType: row.vehicle_type as AutomotiveVehicleType,
    bookingMode: row.booking_mode as ServiceBookingMode,
    estimatedDurationMinutes: row.estimated_duration_minutes == null
      ? null
      : Number(row.estimated_duration_minutes),
    priceFromCents: row.price_from_cents == null ? null : Number(row.price_from_cents),
    currency: row.currency as string,
    requiresDiagnosis: Boolean(row.requires_diagnosis),
    diagnosisFeeCents: row.diagnosis_fee_cents == null ? null : Number(row.diagnosis_fee_cents),
    diagnosisCurrency: typeof row.diagnosis_currency === "string" ? row.diagnosis_currency : null,
  }));
}

export async function loadPublicWorkshopBookingRules(workshopId: string): Promise<PublicWorkshopBookingRules | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_workshop_booking_rules", { requested_workshop_id: workshopId }).maybeSingle();
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    minimumLeadMinutes: Number(row.minimum_lead_minutes), bookingHorizonDays: Number(row.booking_horizon_days),
    slotIntervalMinutes: Number(row.slot_interval_minutes), offersPickup: Boolean(row.offers_pickup),
    offersCourtesyCar: Boolean(row.offers_courtesy_car), allowsWaitOnSite: Boolean(row.allows_wait_on_site),
    timeZone: row.time_zone as string,
    earliestBookingDate: row.earliest_booking_date as string,
    latestBookingDate: row.latest_booking_date as string,
    operatingHours: Array.isArray(row.operating_hours) ? row.operating_hours as PublicWorkshopBookingRules["operatingHours"] : [],
    closures: Array.isArray(row.closures) ? row.closures as PublicWorkshopBookingRules["closures"] : [],
  };
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
  vehicleVin: string | null;
  mileageKm: number | null;
  preferredStart: string;
  alternateStart: string | null;
  customerNote: string | null;
  mobilityRequirement: "none" | "pickup" | "courtesy_car" | "wait_on_site";
  locale: "en" | "de" | "ro" | "hu";
  managementTokenDigest: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_public_service_booking_request_v2", {
    requested_workshop_id: input.workshopId,
    requested_service_id: input.serviceId,
    requested_customer_name: input.customerName,
    requested_customer_phone: input.customerPhone,
    requested_customer_email: input.customerEmail,
    requested_vehicle_registration: input.vehicleRegistration,
    requested_vehicle_make: input.vehicleMake,
    requested_vehicle_model: input.vehicleModel,
    requested_vehicle_year: input.vehicleYear,
    requested_vehicle_vin: input.vehicleVin,
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
