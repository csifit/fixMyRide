import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseEnvironment } from "../env";

const serviceKeySchema = z.string().min(40);

export function createServiceClient() {
  const environment = requireSupabaseEnvironment();
  const serviceKey = serviceKeySchema.parse(
    process.env.SUPABASE_SECRET_KEY,
  );
  return createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
