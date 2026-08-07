"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DataAccessError } from "@/lib/dal/errors";
import { createManualWorkshopAppointment, manageWorkshopBooking } from "@/lib/dal/workshop-bookings";
import { dispatchDueServiceBookingNotifications } from "@/lib/sms/service-booking-notifications";

export type WorkshopBookingActionState = {
  status: "idle" | "confirmed" | "proposed" | "rescheduled" | "declined" | "cancelled" | "invalid" | "unauthorized" | "unavailable";
};

export type ManualAppointmentState = {
  status: "idle" | "created" | "invalid" | "unauthorized" | "unavailable";
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

const optionalNumber = (minimum: number, maximum: number) => z.union([
  z.literal("").transform(() => null),
  z.coerce.number().int().min(minimum).max(maximum),
]);
const manualSchema = z.object({
  workshopProfileId: z.uuid(), serviceId: z.uuid(), start: z.iso.datetime(),
  durationMinutes: z.coerce.number().int().min(15).max(1440),
  source: z.enum(["manager_phone", "manager_walk_in", "manager_other"]),
  customerName: z.string().trim().min(2).max(160),
  customerPhone: z.union([
    z.literal(""),
    z.string().trim().min(7).max(40),
  ]).transform((value) => value || null),
  customerEmail: z.union([z.literal(""), z.email().max(320)]).transform((value) => value || null),
  vehicleRegistration: z.string().trim().min(2).max(20),
  vehicleMake: z.string().trim().min(1).max(80),
  vehicleModel: z.string().trim().min(1).max(100),
  vehicleYear: optionalNumber(1886, 2200), mileageKm: optionalNumber(0, 5_000_000),
  customerStates: z.string().trim().max(2000).transform((value) => value || null),
  locale: z.enum(["en", "de", "ro", "hu"]),
});

function failure(error: unknown): WorkshopBookingActionState {
  if (error instanceof DataAccessError) {
    if (error.code === "unauthorized") return { status: "unauthorized" };
    if (error.code === "invalid_input" || error.code === "conflict") return { status: "invalid" };
  }
  return { status: "unavailable" };
}

export async function createManualAppointmentAction(
  _state: ManualAppointmentState,
  formData: FormData,
): Promise<ManualAppointmentState> {
  const localStart = String(formData.get("start") ?? "");
  const parsed = manualSchema.safeParse({
    ...Object.fromEntries(formData),
    start: localStart ? new Date(localStart).toISOString() : "",
  });
  if (!parsed.success) return { status: "invalid" };
  try {
    const bookingId = await createManualWorkshopAppointment(parsed.data);
    await dispatchDueServiceBookingNotifications(bookingId).catch(() => undefined);
    revalidatePath("/workshop-manager/requests");
    revalidatePath("/workshop-manager/repairs");
    return { status: "created" };
  } catch (error) {
    const state = failure(error);
    return { status: state.status === "invalid" || state.status === "unauthorized" ? state.status : "unavailable" };
  }
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
    if (action === "confirm" || action === "reschedule") {
      await dispatchDueServiceBookingNotifications(bookingId).catch(() => undefined);
    }
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
