"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseEnvironment } from "../env";

export function createClient() {
  const environment = requireSupabaseEnvironment();
  return createBrowserClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
