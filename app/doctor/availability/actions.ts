"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveDoctorAvailability } from "@/lib/dal/appointments";
import { DataAccessError } from "@/lib/dal/errors";

export type AvailabilityActionState = {
  status: "idle" | "saved" | "invalid" | "unauthorized" | "unavailable";
};

const schema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotDurationMinutes: z.coerce.number().pipe(z.union([
    z.literal(15), z.literal(30), z.literal(45),
  ])),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export async function saveAvailabilityAction(
  _previous: AvailabilityActionState,
  formData: FormData,
): Promise<AvailabilityActionState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.startTime >= parsed.data.endTime) {
    return { status: "invalid" };
  }
  try {
    await saveDoctorAvailability(parsed.data);
    revalidatePath("/doctor/availability");
    revalidatePath("/doctor/appointments");
    return { status: "saved" };
  } catch (error) {
    if (error instanceof DataAccessError && error.code === "unauthorized") {
      return { status: "unauthorized" };
    }
    return { status: "unavailable" };
  }
}
