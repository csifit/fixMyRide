"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DataAccessError } from "@/lib/dal/errors";
import { decideMyRepairEstimate, manageMyServiceBooking } from "@/lib/dal/customer-bookings";

export type CustomerBookingActionState = {
  status: "idle" | "accepted" | "declined" | "cancelled" | "approved" | "estimate_declined" | "invalid" | "unauthorized" | "unavailable";
};

const actionSchema = z.object({
  bookingId: z.uuid(),
  action: z.enum(["accept_proposal", "decline_proposal", "cancel"]),
  note: z.string().trim().max(1000).transform((value) => value || null),
}).superRefine((value, context) => {
  if (value.action === "cancel" && (!value.note || value.note.length < 2)) {
    context.addIssue({ code: "custom", path: ["note"], message: "reason_required" });
  }
});

function failure(error: unknown): CustomerBookingActionState {
  if (error instanceof DataAccessError) {
    if (error.code === "unauthorized") return { status: "unauthorized" };
    if (error.code === "invalid_input" || error.code === "conflict") return { status: "invalid" };
  }
  return { status: "unavailable" };
}

const estimateDecisionSchema = z.object({
  estimateId: z.uuid(),
  decision: z.enum(["approve", "decline"]),
  note: z.string().trim().max(2000).transform((value) => value || null),
});

export async function decideRepairEstimateAction(
  _state: CustomerBookingActionState,
  formData: FormData,
): Promise<CustomerBookingActionState> {
  const parsed = estimateDecisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    await decideMyRepairEstimate(parsed.data);
    revalidatePath("/customer/bookings");
    revalidatePath("/workshop-manager/repairs");
    return { status: parsed.data.decision === "approve" ? "approved" : "estimate_declined" };
  } catch (error) { return failure(error); }
}

export async function manageCustomerBookingAction(
  _state: CustomerBookingActionState,
  formData: FormData,
): Promise<CustomerBookingActionState> {
  const parsed = actionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    await manageMyServiceBooking(parsed.data);
    revalidatePath("/customer/bookings");
    revalidatePath("/garage");
    revalidatePath("/workshop-manager/requests");
    return {
      status: parsed.data.action === "accept_proposal"
        ? "accepted"
        : parsed.data.action === "decline_proposal" ? "declined" : "cancelled",
    };
  } catch (error) {
    return failure(error);
  }
}
