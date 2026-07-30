"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  cancelPendingPublicAppointment,
  createPublicAppointmentChange,
} from "@/lib/dal/public-appointments";
import { DataAccessError } from "@/lib/dal/errors";

export type PublicManagementActionState = {
  status: "idle" | "saved" | "invalid" | "conflict" | "unavailable";
};

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{40,60}$/);
const cancelSchema = z.object({
  token: tokenSchema,
  confirmed: z.literal("yes"),
});
const changeSchema = z.object({
  token: tokenSchema,
  requestType: z.enum(["cancel", "reschedule"]),
  scheduledStart: z.union([z.literal(""), z.iso.datetime()]),
  slotDurationMinutes: z.union([
    z.literal(""),
    z.coerce.number().pipe(z.union([z.literal(15), z.literal(30), z.literal(45)])),
  ]),
  patientNote: z.string().trim().max(500),
  confirmed: z.literal("yes"),
});

function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function errorState(error: unknown): PublicManagementActionState {
  if (error instanceof DataAccessError && error.code === "conflict") {
    return { status: "conflict" };
  }
  return { status: "unavailable" };
}

export async function cancelPendingRequestAction(
  _previous: PublicManagementActionState,
  formData: FormData,
): Promise<PublicManagementActionState> {
  const parsed = cancelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    await cancelPendingPublicAppointment(digest(parsed.data.token));
    revalidatePath("/appointments/status");
    return { status: "saved" };
  } catch (error) {
    return errorState(error);
  }
}

export async function requestAppointmentChangeAction(
  _previous: PublicManagementActionState,
  formData: FormData,
): Promise<PublicManagementActionState> {
  const parsed = changeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  const isReschedule = parsed.data.requestType === "reschedule";
  if (isReschedule && (!parsed.data.scheduledStart || !parsed.data.slotDurationMinutes)) {
    return { status: "invalid" };
  }
  try {
    await createPublicAppointmentChange({
      tokenDigest: digest(parsed.data.token),
      requestType: parsed.data.requestType,
      scheduledStart: isReschedule ? parsed.data.scheduledStart : null,
      slotDurationMinutes: isReschedule
        ? parsed.data.slotDurationMinutes as 15 | 30 | 45
        : null,
      patientNote: parsed.data.patientNote || null,
    });
    revalidatePath("/appointments/status");
    return { status: "saved" };
  } catch (error) {
    return errorState(error);
  }
}
