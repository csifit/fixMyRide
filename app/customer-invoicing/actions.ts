"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  updateProviderCustomerInvoicingPreference,
  updateWorkshopCustomerInvoicingPreference,
} from "@/lib/dal/customer-invoicing";
import { DataAccessError } from "@/lib/dal/errors";

export type CustomerInvoicingActionState = {
  status: "idle" | "saved" | "invalid" | "unauthorized" | "unavailable";
};

const providerSchema = z.object({
  providerId: z.uuid(),
  enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
});
const workshopSchema = z.object({
  workshopId: z.uuid(),
  override: z.enum(["inherit", "enabled", "disabled"]),
});

function failure(error: unknown): CustomerInvoicingActionState {
  if (error instanceof DataAccessError) {
    if (error.code === "unauthorized") return { status: "unauthorized" };
    if (error.code === "invalid_input" || error.code === "not_found") {
      return { status: "invalid" };
    }
  }
  return { status: "unavailable" };
}

function revalidateCustomerInvoicing() {
  revalidatePath("/service-organisation/settings");
  revalidatePath("/service-organisation/repairs");
  revalidatePath("/workshop-manager/invoicing");
  revalidatePath("/workshop-manager/repairs");
}

export async function updateProviderCustomerInvoicingAction(
  _state: CustomerInvoicingActionState,
  formData: FormData,
): Promise<CustomerInvoicingActionState> {
  const parsed = providerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    await updateProviderCustomerInvoicingPreference(parsed.data.providerId, parsed.data.enabled);
    revalidateCustomerInvoicing();
    return { status: "saved" };
  } catch (error) {
    return failure(error);
  }
}

export async function updateWorkshopCustomerInvoicingAction(
  _state: CustomerInvoicingActionState,
  formData: FormData,
): Promise<CustomerInvoicingActionState> {
  const parsed = workshopSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    await updateWorkshopCustomerInvoicingPreference(
      parsed.data.workshopId,
      parsed.data.override === "inherit" ? null : parsed.data.override === "enabled",
    );
    revalidateCustomerInvoicing();
    return { status: "saved" };
  } catch (error) {
    return failure(error);
  }
}
