"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DataAccessError } from "@/lib/dal/errors";
import { manageWorkshopBooking } from "@/lib/dal/workshop-bookings";

export type WorkshopBookingActionState = {
  status: "idle" | "confirmed" | "proposed" | "rescheduled" | "declined" | "cancelled" | "invalid" | "unauthorized" | "unavailable";
};

const actionSchema = z.object({
  bookingId: z.uuid(),
  action: z.enum(["confirm", "propose_time", "reschedule", "decline", "cancel"]),
  requestedStart: z.union([z.literal(""), z.iso.datetime()]).transform((value) => value || null),
  note: z.string().trim().max(1000).transform((value) => value || null),
}).superRefine((value, context) => {
  if (["confirm", "propose_time", "reschedule"].includes(value.action)) {
    if (!value.requestedStart || new Date(value.requestedStart) <= new Date()) {
      context.addIssue({ code: "custom", path: ["requestedStart"], message: "future_time_required" });
    }
  }
  if (["decline", "cancel"].includes(value.action) && (!value.note || value.note.length < 2)) {
    context.addIssue({ code: "custom", path: ["note"], message: "reason_required" });
  }
});

function failure(error: unknown): WorkshopBookingActionState {
  if (error instanceof DataAccessError) {
    if (error.code === "unauthorized") return { status: "unauthorized" };
    if (error.code === "invalid_input" || error.code === "conflict") return { status: "invalid" };
  }
  return { status: "unavailable" };
}

export async function manageWorkshopBookingAction(
  _state: WorkshopBookingActionState,
  formData: FormData,
): Promise<WorkshopBookingActionState> {
  const parsed = actionSchema.safeParse({
    bookingId: formData.get("bookingId"),
    action: formData.get("action"),
    requestedStart: formData.get("requestedStart") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { status: "invalid" };
  try {
    const { bookingId, action, requestedStart: start, note } = parsed.data;
    await manageWorkshopBooking({ bookingId, action, start, note });
    revalidatePath("/workshop-manager/requests");
    revalidatePath("/garage");
    const status = action === "confirm" ? "confirmed"
      : action === "propose_time" ? "proposed"
      : action === "reschedule" ? "rescheduled"
      : action === "decline" ? "declined" : "cancelled";
    return { status };
  } catch (error) {
    return failure(error);
  }
}
