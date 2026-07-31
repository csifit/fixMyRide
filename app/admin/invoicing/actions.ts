"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setNextBillingRates } from "@/lib/dal/invoicing";

export type RateState = { status: "idle" | "saved" | "invalid" | "unavailable" };
const schema = z.object({ subscription: z.coerce.number().min(0).max(10000), sms: z.coerce.number().min(0).max(100) });

export async function updateRatesAction(_state: RateState, formData: FormData): Promise<RateState> {
  const parsed = schema.safeParse({ subscription: formData.get("subscription"), sms: formData.get("sms") });
  if (!parsed.success) return { status: "invalid" };
  try {
    await setNextBillingRates(Math.round(parsed.data.subscription * 100), Math.round(parsed.data.sms * 100));
    revalidatePath("/admin/invoicing");
    return { status: "saved" };
  } catch { return { status: "unavailable" }; }
}
