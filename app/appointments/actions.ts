"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DataAccessError } from "@/lib/dal/errors";
import {
  createManagedAppointment,
  rescheduleSlottedAppointment,
  transitionManagedAppointment,
} from "@/lib/dal/appointments";
import { sendAppointmentCreatedEmail } from "@/lib/email/appointment";
import {
  decidePublicAppointmentChange,
  decidePublicAppointmentRequest,
  loadManagedChangeRequestDetails,
  loadManagedPublicRequestDetails,
} from "@/lib/dal/public-appointments";
import {
  sendAppointmentChangeDecisionEmail,
  sendAppointmentDecisionEmail,
} from "@/lib/email/appointment-lifecycle";
import { dispatchDueAppointmentNotifications } from "@/lib/sms/appointment-notifications";

export type AppointmentActionState = {
  status: "idle" | "saved" | "saved_sms_pending" | "saved_email_pending" | "saved_notifications_pending" | "invalid" | "conflict" | "unauthorized" | "unavailable";
};

const createSchema = z.object({
  clinicianId: z.uuid(),
  patientName: z.string().trim().min(2).max(160),
  patientPhone: z.string().regex(/^(07[0-9]{8}|00407[0-9]{8}|\+407[0-9]{8}|7[0-9]{8})$/),
  patientEmail: z.email().max(320),
  doctorName: z.string().trim().min(2).max(160),
  source: z.enum(["online", "phone", "walk_in", "email", "other"]),
  scheduledStart: z.iso.datetime({ offset: true }),
  slotDurationMinutes: z.coerce.number().pipe(z.union([z.literal(15), z.literal(30), z.literal(45)])),
  locale: z.enum(["en", "de", "ro", "hu"]),
  operationalNote: z.string().trim().max(500).transform((value) => value || null),
  initialStatus: z.enum(["pending", "confirmed"]),
});
const transitionSchema = z.object({
  appointmentId: z.uuid(),
  status: z.enum(["confirmed", "rescheduled", "cancelled", "completed", "no_show"]),
  scheduledStart: z.union([
    z.literal(""),
    z.iso.datetime({ offset: true }),
  ]).transform((value) => value || null),
  slotDurationMinutes: z.union([
    z.literal(""),
    z.coerce.number().pipe(z.union([z.literal(15), z.literal(30), z.literal(45)])),
  ]).transform((value) => value === "" ? null : value),
});
const requestDecisionSchema = z.object({
  requestId: z.uuid(),
  decision: z.enum(["confirmed", "declined"]),
});
const changeDecisionSchema = z.object({
  changeRequestId: z.uuid(),
  decision: z.enum(["approved", "declined"]),
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
  try {
    const appointmentId = await createManagedAppointment({
      ...parsed.data,
      patientEmail: parsed.data.patientEmail,
    });
    revalidatePath("/doctor/appointments");
    revalidatePath("/staff/appointments");
    const [emailSent, smsState] = await Promise.all([
      sendAppointmentCreatedEmail({
        to: parsed.data.patientEmail,
        patientName: parsed.data.patientName,
        doctorName: parsed.data.doctorName,
        scheduledStart: parsed.data.scheduledStart,
        slotDurationMinutes: parsed.data.slotDurationMinutes,
        status: parsed.data.initialStatus,
        locale: parsed.data.locale,
      }),
      parsed.data.initialStatus === "confirmed"
        ? tryImmediateSms(appointmentId)
        : Promise.resolve<AppointmentActionState>({ status: "saved" }),
    ]);
    if (!emailSent && smsState.status === "saved_sms_pending") {
      return { status: "saved_notifications_pending" };
    }
    if (!emailSent) return { status: "saved_email_pending" };
    return smsState;
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
    !parsed.data.scheduledStart || !parsed.data.slotDurationMinutes
  )) return { status: "invalid" };
  try {
    if (parsed.data.status === "rescheduled") {
      await rescheduleSlottedAppointment(
        parsed.data.appointmentId,
        parsed.data.scheduledStart!,
        parsed.data.slotDurationMinutes!,
      );
    } else {
      await transitionManagedAppointment(
        parsed.data.appointmentId,
        parsed.data.status,
        null,
        null,
      );
    }
    revalidatePath("/doctor/appointments");
    revalidatePath("/staff/appointments");
    return parsed.data.status === "confirmed"
      ? await tryImmediateSms(parsed.data.appointmentId)
      : { status: "saved" };
  } catch (error) {
    return errorState(error);
  }
}

export async function decideAppointmentRequestAction(
  _previous: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const parsed = requestDecisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    const details = await loadManagedPublicRequestDetails(parsed.data.requestId);
    if (!details) return { status: "unauthorized" };
    const appointmentId = await decidePublicAppointmentRequest(
      parsed.data.requestId,
      parsed.data.decision,
    );
    revalidatePath("/doctor/appointments");
    revalidatePath("/staff/appointments");
    const [emailSent, smsState] = await Promise.all([
      sendAppointmentDecisionEmail({
        to: details.patientEmail,
        patientName: details.patientName,
        doctorName: details.doctorName,
        clinicName: details.clinicName,
        scheduledStart: details.scheduledStart,
        slotDurationMinutes: details.slotDurationMinutes,
        locale: details.locale,
        decision: parsed.data.decision,
      }),
      parsed.data.decision === "confirmed" && appointmentId
        ? tryImmediateSms(appointmentId)
        : Promise.resolve<AppointmentActionState>({ status: "saved" }),
    ]);
    if (!emailSent && smsState.status === "saved_sms_pending") {
      return { status: "saved_notifications_pending" };
    }
    if (!emailSent) return { status: "saved_email_pending" };
    return smsState;
  } catch (error) {
    return errorState(error);
  }
}

export async function decideAppointmentChangeRequestAction(
  _previous: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const parsed = changeDecisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    const details = await loadManagedChangeRequestDetails(parsed.data.changeRequestId);
    if (!details) return { status: "unauthorized" };
    await decidePublicAppointmentChange(
      parsed.data.changeRequestId,
      parsed.data.decision,
    );
    revalidatePath("/doctor/appointments");
    revalidatePath("/staff/appointments");
    const emailSent = await sendAppointmentChangeDecisionEmail({
      to: details.patientEmail,
      patientName: details.patientName,
      doctorName: details.doctorName,
      clinicName: details.clinicName,
      currentStart: details.currentStart,
      requestedStart: details.requestedStart,
      requestedSlotDurationMinutes: details.requestedSlotDurationMinutes,
      locale: details.locale,
      requestType: details.requestType,
      decision: parsed.data.decision,
    });
    return emailSent ? { status: "saved" } : { status: "saved_email_pending" };
  } catch (error) {
    return errorState(error);
  }
}
