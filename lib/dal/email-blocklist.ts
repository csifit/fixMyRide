import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { classifyDatabaseError, DataAccessError } from "./errors";

export async function isPlatformEmailBlocked(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await createServiceClient()
    .from("platform_email_blocklist")
    .select("blocked")
    .eq("email", normalizedEmail)
    .maybeSingle();
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  return data?.blocked === true;
}
