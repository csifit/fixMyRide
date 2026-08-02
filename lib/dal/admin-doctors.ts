import "server-only";

import { createClient } from "../supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export async function createPlatformDoctorInvitation(
  email: string,
  freeAccessMonths: 0 | 3 | 6 | 12,
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_platform_doctor_invitation", {
    requested_email: email,
    requested_free_access_months: freeAccessMonths,
    request_correlation_id: crypto.randomUUID(),
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  if (typeof data !== "string") throw new DataAccessError("unavailable");
  return data;
}

export async function updateAdminDoctor(input: {
  clinicianId: string;
  fullName: string;
  specialty: string;
  clinicName: string;
  clinicCountry: string;
  professionalIdentifier: string;
  verificationStatus: "pending" | "approved" | "suspended" | "rejected";
  statusReason: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_admin_doctor", {
    requested_clinician_id: input.clinicianId,
    new_full_name: input.fullName,
    new_specialty: input.specialty,
    new_clinic_name: input.clinicName,
    new_clinic_country: input.clinicCountry,
    new_professional_identifier: input.professionalIdentifier,
    new_verification_status: input.verificationStatus,
    status_reason: input.statusReason,
    request_correlation_id: crypto.randomUUID(),
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}
