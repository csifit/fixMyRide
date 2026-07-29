import "server-only";

import type { ClinicianStatus, DoctorRouteState } from "../authz";
import { classifyDoctorAccess } from "../authz";
import { readSupabaseEnvironment } from "../env";
import { createClient } from "../supabase/server";

export type ClinicianContext = {
  id: string;
  authUserId: string;
  fullName: string;
  specialty: string;
  clinicName: string;
  clinicCountry: string;
  verificationStatus: ClinicianStatus;
};

export type DoctorAccessResult =
  | { state: "configuration" }
  | { state: Exclude<DoctorRouteState, "approved"> }
  | { state: "approved"; clinician: ClinicianContext };

export async function getDoctorAccess(): Promise<DoctorAccessResult> {
  if (!readSupabaseEnvironment().configured) return { state: "configuration" };

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const authenticatedUserId = claimsError ? undefined : claimsData?.claims?.sub;
  if (!authenticatedUserId) return { state: "unauthenticated" };

  const { data: clinician } = await supabase
    .from("clinicians")
    .select(
      "id, auth_user_id, full_name, specialty, clinic_name, clinic_country, verification_status",
    )
    .eq("auth_user_id", authenticatedUserId)
    .maybeSingle();

  const state = classifyDoctorAccess({
    authenticatedUserId,
    clinicianAuthUserId: clinician?.auth_user_id ?? undefined,
    verificationStatus:
      (clinician?.verification_status as ClinicianStatus | undefined) ?? undefined,
  });
  if (state !== "approved") return { state };
  if (!clinician) return { state: "unauthorized" };

  return {
    state,
    clinician: {
      id: clinician.id,
      authUserId: authenticatedUserId,
      fullName: clinician.full_name,
      specialty: clinician.specialty,
      clinicName: clinician.clinic_name,
      clinicCountry: clinician.clinic_country,
      verificationStatus: "approved",
    },
  };
}
