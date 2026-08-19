"use server";

import { z } from "zod";
import { dismissMyGuidance } from "@/lib/dal/guidance";

const schema = z.object({
  role: z.enum(["workshop_manager", "service_organisation"]),
  guideKey: z.string().regex(/^[a-z0-9_]{2,80}$/),
  version: z.number().int().positive(),
});

export async function dismissGuidanceAction(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false } as const;
  try {
    await dismissMyGuidance(parsed.data);
    return { ok: true } as const;
  } catch {
    return { ok: false } as const;
  }
}
