"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { readBookingAccessDigest } from "@/lib/booking-access-session";
import { decideGuestEstimate, manageGuestBooking } from "@/lib/dal/booking-access";
import { DataAccessError } from "@/lib/dal/errors";
import { dispatchDueBookingCommunications } from "@/lib/messaging/booking-communications";
import { dispatchDueServiceBookingNotifications } from "@/lib/sms/service-booking-notifications";

export type GuestBookingActionState = { status: "idle" | "saved" | "invalid" | "expired" | "unavailable" };

const bookingSchema = z.object({
  action: z.enum(["accept_proposal", "decline_proposal", "cancel"]),
  note: z.string().trim().max(2000).transform((value) => value || null),
}).superRefine((value, context) => {
  if (value.action === "cancel" && (!value.note || value.note.length < 2)) {
    context.addIssue({ code: "custom", path: ["note"], message: "reason_required" });
  }
});

function failure(error: unknown): GuestBookingActionState {
  if (error instanceof DataAccessError && error.code === "unauthorized") return { status: "expired" };
  if (error instanceof DataAccessError && (error.code === "conflict" || error.code === "invalid_input")) return { status: "invalid" };
  return { status: "unavailable" };
}

export async function manageGuestBookingAction(
  _state: GuestBookingActionState,
  formData: FormData,
): Promise<GuestBookingActionState> {
  const parsed = bookingSchema.safeParse(Object.fromEntries(formData));
  const digest = await readBookingAccessDigest();
  if (!parsed.success) return { status: "invalid" };
  if (!digest) return { status: "expired" };
  try {
    const bookingId = await manageGuestBooking({ digest, ...parsed.data });
    await Promise.allSettled([
      dispatchDueBookingCommunications(bookingId),
      dispatchDueServiceBookingNotifications(bookingId),
    ]);
    revalidatePath("/customer/booking-access");
    revalidatePath("/workshop-manager/requests");
    return { status: "saved" };
  } catch (error) { return failure(error); }
}

const estimateSchema = z.object({
  estimateId: z.uuid(), decision: z.enum(["approve", "decline"]),
  note: z.string().trim().max(2000).transform((value) => value || null),
});

export async function decideGuestEstimateAction(
  _state: GuestBookingActionState,
  formData: FormData,
): Promise<GuestBookingActionState> {
  const parsed = estimateSchema.safeParse(Object.fromEntries(formData));
  const digest = await readBookingAccessDigest();
  if (!parsed.success) return { status: "invalid" };
  if (!digest) return { status: "expired" };
  try {
    const bookingId = await decideGuestEstimate({ digest, ...parsed.data });
    await dispatchDueBookingCommunications(bookingId).catch(() => undefined);
    revalidatePath("/customer/booking-access");
    revalidatePath("/workshop-manager/repairs");
    return { status: "saved" };
  } catch (error) { return failure(error); }
}
