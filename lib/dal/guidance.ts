import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type GuidanceRole = "workshop_manager" | "service_organisation";

export async function loadMyDismissedGuides(role: GuidanceRole): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_guidance_preferences", {
    requested_role: role,
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  return ((data ?? []) as Array<{ guide_key: string; guidance_version: number }>)
    .filter((item) => item.guidance_version >= 1)
    .map((item) => item.guide_key);
}

export async function dismissMyGuidance(input: {
  role: GuidanceRole;
  guideKey: string;
  version: number;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("dismiss_my_guidance", {
    requested_role: input.role,
    requested_guide_key: input.guideKey,
    requested_guidance_version: input.version,
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}
