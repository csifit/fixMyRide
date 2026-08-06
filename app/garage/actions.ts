"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addMyVehicle } from "@/lib/dal/garage";

export type GarageActionState = { status: "idle" | "saved" | "invalid" | "unavailable" };

const vehicleSchema = z.object({
  registrationNumber: z.string().trim().min(2).max(20),
  vin: z.string().trim().toUpperCase().refine((value) => !value || /^[A-HJ-NPR-Z0-9]{17}$/.test(value)),
  make: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(100),
  productionYear: z.string().transform((value) => value ? Number(value) : null).pipe(z.number().int().min(1886).max(2200).nullable()),
  engineDescription: z.string().trim().max(120).transform((value) => value || null),
  fuelType: z.union([z.literal(""), z.enum(["petrol", "diesel", "hybrid", "electric", "lpg", "other"])]).transform((value) => value || null),
  currentMileageKm: z.string().transform((value) => value ? Number(value) : null).pipe(z.number().int().min(0).max(5_000_000).nullable()),
  nickname: z.string().trim().max(60).transform((value) => value || null),
});

export async function addVehicleAction(_previous: GarageActionState, formData: FormData): Promise<GarageActionState> {
  const parsed = vehicleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    await addMyVehicle(parsed.data);
    revalidatePath("/garage");
    return { status: "saved" };
  } catch {
    return { status: "unavailable" };
  }
}
