"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DataAccessError } from "@/lib/dal/errors";
import { setAdminServiceProviderStatus } from "@/lib/dal/commercial-admin";

export type CommercialAdminActionState = { status: "idle" | "saved" | "invalid" | "unauthorized" | "unavailable" };
const schema = z.object({ providerId: z.uuid(), providerStatus: z.enum(["pending", "active", "suspended", "rejected"]), reason: z.string().trim().min(2).max(500) });

export async function updateServiceProviderStatusAction(_state: CommercialAdminActionState, formData: FormData): Promise<CommercialAdminActionState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    await setAdminServiceProviderStatus(parsed.data.providerId, parsed.data.providerStatus, parsed.data.reason);
    revalidatePath("/admin/invoicing"); revalidatePath("/workshop-manager"); revalidatePath("/");
    return { status: "saved" };
  } catch (error) {
    if (error instanceof DataAccessError) {
      if (error.code === "unauthorized") return { status: "unauthorized" };
      if (["invalid_input", "conflict"].includes(error.code)) return { status: "invalid" };
    }
    return { status: "unavailable" };
  }
}
