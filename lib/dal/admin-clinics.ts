import "server-only";

import { createClient } from "../supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type AdminClinicLocationInput = {
  displayName: string;
  countryCode: string;
  description: string;
  publicPhone: string;
  publicEmail: string;
  city: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  status: "pending" | "active" | "suspended" | "rejected";
};

export async function createAdminClinicLocation(
  clinicId: string,
  input: AdminClinicLocationInput,
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_admin_clinic_location", {
    requested_clinic_id: clinicId,
    new_display_name: input.displayName,
    new_country_code: input.countryCode,
    new_description: input.description,
    new_public_phone: input.publicPhone,
    new_public_email: input.publicEmail,
    new_city: input.city,
    new_address: input.address,
    new_latitude: input.latitude,
    new_longitude: input.longitude,
    new_status: input.status,
    request_correlation_id: crypto.randomUUID(),
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}

export async function updateAdminClinicLocation(
  locationId: string,
  input: AdminClinicLocationInput & { statusReason: string },
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_admin_clinic_location", {
    requested_location_id: locationId,
    new_display_name: input.displayName,
    new_country_code: input.countryCode,
    new_description: input.description,
    new_public_phone: input.publicPhone,
    new_public_email: input.publicEmail,
    new_city: input.city,
    new_address: input.address,
    new_latitude: input.latitude,
    new_longitude: input.longitude,
    new_status: input.status,
    status_reason: input.statusReason,
    request_correlation_id: crypto.randomUUID(),
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}

export async function setAdminDoctorLocationAssignment(input: {
  locationId: string;
  clinicianId: string;
  status: "active" | "suspended" | "ended";
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_admin_doctor_location_assignment", {
    requested_location_id: input.locationId,
    requested_clinician_id: input.clinicianId,
    new_status: input.status,
    request_correlation_id: crypto.randomUUID(),
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}
