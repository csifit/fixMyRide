import "server-only";

import { createClient } from "../supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export async function updateAdminPatientAccount(input: {
  patientId: string;
  fullName: string;
  familyName: string;
  givenNames: string;
  accountPhone: string;
  preferredLanguage: "en" | "de" | "ro" | "hu";
  accountStatus: "active" | "suspended" | "blocked";
  statusReason: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_admin_patient_account", {
    requested_patient_id: input.patientId,
    new_full_name: input.fullName,
    new_family_name: input.familyName,
    new_given_names: input.givenNames,
    new_account_phone: input.accountPhone,
    new_preferred_language: input.preferredLanguage,
    new_account_status: input.accountStatus,
    status_reason: input.statusReason,
    request_correlation_id: crypto.randomUUID(),
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}
