"use server";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  createPublicAppointmentRequest,
  getPublicDoctor,
  loadPublicDoctorSlots,
} from "@/lib/dal/public-appointments";
import { DataAccessError } from "@/lib/dal/errors";
import { sendAppointmentRequestEmail } from "@/lib/email/appointment-request";

export type PublicBookingState = {
  status: "idle" | "success" | "success_email_pending" | "invalid" | "conflict" | "unavailable";
  managementToken?: string;
};

const schema = z.object({
  clinicianId: z.uuid(),
  scheduledStart: z.iso.datetime(),
  slotDurationMinutes: z.coerce.number().pipe(z.union([
    z.literal(15), z.literal(30), z.literal(45),
  ])),
  patientName: z.string().trim().min(2).max(160),
  patientPhone: z.string().regex(/^(07[0-9]{8}|00407[0-9]{8}|\+407[0-9]{8}|7[0-9]{8})$/),
  patientEmail: z.email().max(320),
  patientNote: z.string().trim().max(500).transform((value) => value || null),
  locale: z.enum(["en", "de", "ro", "hu"]),
  privacyAccepted: z.literal("yes"),
});

export async function requestPublicAppointmentAction(
  _previous: PublicBookingState,
  formData: FormData,
): Promise<PublicBookingState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    const doctor = await getPublicDoctor(parsed.data.clinicianId);
    if (!doctor) return { status: "invalid" };
    const localDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Bucharest",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(parsed.data.scheduledStart));
    const slots = await loadPublicDoctorSlots(parsed.data.clinicianId, localDate);
    const validSlot = slots.some((slot) =>
      slot.scheduledStart === parsed.data.scheduledStart
      && slot.slotDurationMinutes === parsed.data.slotDurationMinutes
    );
    if (!validSlot) return { status: "conflict" };

    const managementToken = randomBytes(32).toString("base64url");
    const managementTokenDigest = createHash("sha256")
      .update(managementToken)
      .digest("hex");
    await createPublicAppointmentRequest({
      ...parsed.data,
      patientNote: parsed.data.patientNote,
      managementTokenDigest,
    });
    const emailSent = await sendAppointmentRequestEmail({
      to: parsed.data.patientEmail,
      patientName: parsed.data.patientName,
      doctorName: doctor.name,
      clinicName: doctor.clinicName,
      scheduledStart: parsed.data.scheduledStart,
      slotDurationMinutes: parsed.data.slotDurationMinutes,
      locale: parsed.data.locale,
      managementToken,
    });
    return {
      status: emailSent ? "success" : "success_email_pending",
      managementToken,
    };
  } catch (error) {
    if (error instanceof DataAccessError && error.code === "conflict") {
      return { status: "conflict" };
    }
    return { status: "unavailable" };
  }
}
