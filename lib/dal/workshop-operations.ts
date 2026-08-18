import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type WorkshopOperatingHour = {
  weekday: number;
  opensAt: string | null;
  closesAt: string | null;
  closed: boolean;
};

export type WorkshopClosure = {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

export type WorkshopOperations = {
  id: string;
  serviceProviderId: string;
  serviceProviderName: string;
  displayName: string;
  countryCode: string;
  status: string;
  claimStatus: "not_applicable" | "unclaimed" | "awaiting_payment" | "claimed";
  logoPath: string | null;
  logoUrl: string | null;
  logoEligible: boolean;
  description: string | null;
  publicPhone: string | null;
  publicEmail: string | null;
  city: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  acceptsBookingRequests: boolean;
  offersPickup: boolean;
  offersCourtesyCar: boolean;
  allowsWaitOnSite: boolean;
  timeZone: string;
  minimumLeadMinutes: number;
  bookingHorizonDays: number;
  dailyBookingCapacity: number;
  slotIntervalMinutes: 15 | 30 | 45 | 60;
  operatingHours: WorkshopOperatingHour[];
  closures: WorkshopClosure[];
};

export type UpdateWorkshopOperationsInput = Omit<WorkshopOperations,
  "serviceProviderId" | "serviceProviderName" | "countryCode" | "status" | "claimStatus" | "logoPath" | "logoUrl" | "logoEligible" | "closures"
>;

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

const numberOrNull = (value: unknown) => value == null ? null : Number(value);

export async function loadMyWorkshopOperations(): Promise<WorkshopOperations[]> {
  const supabase = await createClient();
  const [{ data, error }, logoSettings] = await Promise.all([
    supabase.rpc("get_my_workshop_operations"),
    supabase.rpc("get_my_workshop_logo_settings"),
  ]);
  if (error) fail(error);
  if (logoSettings.error) fail(logoSettings.error);
  const settingsByWorkshop = new Map(
    ((logoSettings.data ?? []) as Record<string, unknown>[]).map((row) => [row.workshop_id as string, row]),
  );
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.workshop_id as string,
    serviceProviderId: row.service_provider_id as string,
    serviceProviderName: row.service_provider_name as string,
    displayName: row.display_name as string,
    countryCode: row.country_code as string,
    status: row.workshop_status as string,
    claimStatus: (settingsByWorkshop.get(row.workshop_id as string)?.claim_status ?? "unclaimed") as WorkshopOperations["claimStatus"],
    logoPath: settingsByWorkshop.get(row.workshop_id as string)?.logo_path as string | null ?? null,
    logoUrl: (() => {
      const path = settingsByWorkshop.get(row.workshop_id as string)?.logo_path;
      return typeof path === "string"
        ? supabase.storage.from("workshop-logos").getPublicUrl(path).data.publicUrl
        : null;
    })(),
    logoEligible: Boolean(settingsByWorkshop.get(row.workshop_id as string)?.logo_eligible),
    description: row.description as string | null,
    publicPhone: row.public_phone as string | null,
    publicEmail: row.public_email as string | null,
    city: row.city as string | null,
    address: row.address as string | null,
    latitude: numberOrNull(row.latitude),
    longitude: numberOrNull(row.longitude),
    acceptsBookingRequests: Boolean(row.accepts_booking_requests),
    offersPickup: Boolean(row.offers_pickup),
    offersCourtesyCar: Boolean(row.offers_courtesy_car),
    allowsWaitOnSite: Boolean(row.allows_wait_on_site),
    timeZone: row.time_zone as string,
    minimumLeadMinutes: Number(row.minimum_lead_minutes),
    bookingHorizonDays: Number(row.booking_horizon_days),
    dailyBookingCapacity: Number(row.daily_booking_capacity),
    slotIntervalMinutes: Number(row.slot_interval_minutes) as 15 | 30 | 45 | 60,
    operatingHours: Array.isArray(row.operating_hours) ? row.operating_hours as WorkshopOperatingHour[] : [],
    closures: Array.isArray(row.closures) ? row.closures as WorkshopClosure[] : [],
  }));
}

export async function uploadMyWorkshopLogo(input: {
  workshopId: string;
  file: File;
  extension: "jpg" | "jpeg" | "png";
}) {
  const supabase = await createClient();
  const { data: settings, error: settingsError } = await supabase
    .rpc("get_my_workshop_logo_settings")
    .eq("workshop_id", input.workshopId)
    .maybeSingle();
  if (settingsError) fail(settingsError);
  const logoSettings = settings as Record<string, unknown> | null;
  if (!logoSettings || !logoSettings.logo_eligible) throw new DataAccessError("unauthorized");

  const previousPath = typeof logoSettings.logo_path === "string" ? logoSettings.logo_path : null;
  const logoPath = `${input.workshopId}/logo-${crypto.randomUUID()}.${input.extension}`;
  const { error: uploadError } = await supabase.storage
    .from("workshop-logos")
    .upload(logoPath, input.file, {
      upsert: true,
      contentType: input.file.type,
      cacheControl: "3600",
    });
  if (uploadError) fail(uploadError);

  const { error: saveError } = await supabase.rpc("set_my_workshop_logo_path", {
    requested_workshop_id: input.workshopId,
    new_logo_path: logoPath,
  });
  if (saveError) {
    await supabase.storage.from("workshop-logos").remove([logoPath]);
    fail(saveError);
  }
  if (previousPath && previousPath !== logoPath) {
    const { error: removeError } = await supabase.storage.from("workshop-logos").remove([previousPath]);
    if (removeError) console.error("remove_previous_workshop_logo", { message: removeError.message });
  }
}

export async function createMyWorkshopLocation(input: {
  serviceProviderId: string;
  displayName: string;
  countryCode: string;
  city: string;
  address: string;
  latitude: number;
  longitude: number;
  publicPhone: string | null;
  publicEmail: string | null;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_my_workshop_location", {
    requested_service_provider_id: input.serviceProviderId,
    requested_display_name: input.displayName,
    requested_country_code: input.countryCode,
    requested_city: input.city,
    requested_address: input.address,
    requested_latitude: input.latitude,
    requested_longitude: input.longitude,
    requested_public_phone: input.publicPhone,
    requested_public_email: input.publicEmail,
  });
  if (error) console.error("create_my_workshop_location", { code: error.code });
  if (error) fail(error);
  return data as string;
}

export async function updateMyWorkshopOperations(input: UpdateWorkshopOperationsInput) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_workshop_operations", {
    requested_workshop_id: input.id,
    new_display_name: input.displayName,
    new_description: input.description,
    new_public_phone: input.publicPhone,
    new_public_email: input.publicEmail,
    new_city: input.city,
    new_address: input.address,
    new_latitude: input.latitude,
    new_longitude: input.longitude,
    new_accepts_booking_requests: input.acceptsBookingRequests,
    new_offers_pickup: input.offersPickup,
    new_offers_courtesy_car: input.offersCourtesyCar,
    new_allows_wait_on_site: input.allowsWaitOnSite,
    new_time_zone: input.timeZone,
    new_minimum_lead_minutes: input.minimumLeadMinutes,
    new_booking_horizon_days: input.bookingHorizonDays,
    new_daily_booking_capacity: input.dailyBookingCapacity,
    new_slot_interval_minutes: input.slotIntervalMinutes,
    new_operating_hours: input.operatingHours,
  });
  if (error) fail(error);
}

export async function addMyWorkshopClosure(input: { workshopId: string; startsAt: string; endsAt: string; reason: string | null }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_my_workshop_closure", {
    requested_workshop_id: input.workshopId,
    requested_starts_at: input.startsAt,
    requested_ends_at: input.endsAt,
    requested_reason: input.reason,
  });
  if (error) fail(error);
}

export async function removeMyWorkshopClosure(closureId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_my_workshop_closure", {
    requested_closure_id: closureId,
  });
  if (error) fail(error);
}
