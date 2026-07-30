"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DataAccessError } from "@/lib/dal/errors";
import {
  createManagedAppointment,
  transitionManagedAppointment,
} from "@/lib/dal/appointments";
import { dispatchDueAppointmentNotifications } from "@/lib/sms/appointment-notifications";

export type AppointmentActionState = {
  status: "idle" | "saved" | "saved_sms_pending" | "invalid" | "conflict" | "unauthorized" | "unavailable";
};

const createSchema = z.object({
  clinicianId: z.uuid(),
  patientName: z.string().trim().min(2).max(160),
  patientPhone: z.string().regex(/^(07[0-9]{8}|00407[0-9]{8}|\+407[0-9]{8}|7[0-9]{8})$/),
  patientEmail: z.union([z.literal(""), z.email().max(320)]).transform((value) => value || null),
  source: z.enum(["online", "phone", "walk_in", "email", "other"]),
  scheduledStart: z.iso.datetime(),
  scheduledEnd: z.iso.datetime(),
  locale: z.enum(["en", "de", "ro", "hu"]),
  operationalNote: z.string().trim().max(500).transform((value) => value || null),
  initialStatus: z.enum(["pending", "confirmed"]),
});
const transitionSchema = z.object({
  appointmentId: z.uuid(),
  status: z.enum(["confirmed", "rescheduled", "cancelled", "completed", "no_show"]),
  scheduledStart: z.union([z.literal(""), z.iso.datetime()]).transform((value) => value || null),
  scheduledEnd: z.union([z.literal(""), z.iso.datetime()]).transform((value) => value || null),
});

function errorState(error: unknown): AppointmentActionState {
  if (error instanceof DataAccessError) {
    if (error.code === "unauthorized") return { status: "unauthorized" };
    if (error.code === "conflict") return { status: "conflict" };
  }
  return { status: "unavailable" };
}

async function tryImmediateSms(appointmentId: string): Promise<AppointmentActionState> {
  try {
    const delivery = await dispatchDueAppointmentNotifications(appointmentId);
    return delivery.failed || !delivery.sent
      ? { status: "saved_sms_pending" }
      : { status: "saved" };
  } catch {
    return { status: "saved_sms_pending" };
  }
}

export async function createAppointmentAction(
  _previous: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  if (new Date(parsed.data.scheduledEnd) <= new Date(parsed.data.scheduledStart)) {
    return { status: "invalid" };
  }
  try {
    const appointmentId = await createManagedAppointment(parsed.data);
    revalidatePath("/doctor/appointments");
    revalidatePath("/staff/appointments");
    return parsed.data.initialStatus === "confirmed"
      ? await tryImmediateSms(appointmentId)
      : { status: "saved" };
  } catch (error) {
    return errorState(error);
  }
}

export async function transitionAppointmentAction(
  _previous: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const parsed = transitionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  if (parsed.data.status === "rescheduled" && (
    !parsed.data.scheduledStart || !parsed.data.scheduledEnd
  )) return { status: "invalid" };
  try {
    await transitionManagedAppointment(
      parsed.data.appointmentId,
      parsed.data.status,
      parsed.data.scheduledStart,
      parsed.data.scheduledEnd,
    );
    revalidatePath("/doctor/appointments");
    revalidatePath("/staff/appointments");
    return parsed.data.status === "confirmed"
      ? await tryImmediateSms(parsed.data.appointmentId)
      : { status: "saved" };
  } catch (error) {
    return errorState(error);
  }
}
