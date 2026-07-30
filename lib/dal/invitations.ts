import "server-only";

import { createClient } from "../supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export async function createClinicDoctorInvitation(
  clinicId: string,
  email: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_clinic_doctor_invitation", {
    requested_clinic_id: clinicId,
    requested_email: email,
    request_correlation_id: crypto.randomUUID(),
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  if (typeof data !== "string") throw new DataAccessError("unavailable");
  return data;
}

export async function createDoctorStaffInvitation(email: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_doctor_staff_invitation", {
    requested_email: email,
    request_correlation_id: crypto.randomUUID(),
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  if (typeof data !== "string") throw new DataAccessError("unavailable");
  return data;
}

export async function setClinicDoctorMembershipStatus(
  membershipId: string,
  status: "active" | "suspended" | "ended",
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "set_clinic_doctor_membership_status",
    {
      requested_membership_id: membershipId,
      new_status: status,
      request_correlation_id: crypto.randomUUID(),
    },
  );
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}

