"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DataAccessError } from "@/lib/dal/errors";
import { updateMyBilling } from "@/lib/dal/invoicing";

export type BillingMutationState = {
  status: "idle" | "saved" | "invalid" | "unauthorized" | "unavailable";
};

const nullable = (max: number) =>
  z.string().trim().max(max).transform((value) => value || null);
const schema = z.object({
  clinicId: z.union([z.literal(""), z.uuid()]).transform((value) => value || null),
  legalName: nullable(200),
  fiscalIdentifier: nullable(40),
  vatIdentifier: nullable(40),
  tradeRegisterNumber: nullable(60),
  billingAddress: nullable(500),
  billingCountry: z.union([z.literal(""), z.string().regex(/^[A-Za-z]{2}$/)]).transform((value) => value ? value.toUpperCase() : null),
  billingEmail: z.union([z.literal(""), z.email().max(320)]).transform((value) => value || null),
  billingContact: nullable(160),
});

export async function updateBillingAction(
  _state: BillingMutationState,
  formData: FormData,
): Promise<BillingMutationState> {
  const input = schema.safeParse({
    clinicId: formData.get("clinicId"),
    legalName: formData.get("legalName"),
    fiscalIdentifier: formData.get("fiscalIdentifier"),
    vatIdentifier: formData.get("vatIdentifier"),
    tradeRegisterNumber: formData.get("tradeRegisterNumber"),
    billingAddress: formData.get("billingAddress"),
    billingCountry: formData.get("billingCountry"),
    billingEmail: formData.get("billingEmail"),
    billingContact: formData.get("billingContact"),
  });
  if (!input.success) return { status: "invalid" };
  try {
    await updateMyBilling(input.data.clinicId, input.data);
    revalidatePath(input.data.clinicId ? "/clinic-manager/invoicing" : "/doctor/invoicing");
    return { status: "saved" };
  } catch (error) {
    if (error instanceof DataAccessError) {
      if (error.code === "unauthorized") return { status: "unauthorized" };
      if (error.code === "invalid_input") return { status: "invalid" };
    }
    return { status: "unavailable" };
  }
}

