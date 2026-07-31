"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DataAccessError } from "@/lib/dal/errors";
import { updateDoctorProfile, updateIndependentWorkspace } from "@/lib/dal/workspaces";

export type SettingsState = { status: "idle" | "saved" | "invalid" | "unauthorized" | "unavailable" };
const nullable = (max: number) => z.string().trim().max(max).transform((value) => value || null);
const nullableNumber = z.union([z.literal(""), z.coerce.number()]).transform((value) => value === "" ? null : value);
const profileSchema = z.object({
  professionalBio: nullable(2000), publicPhone: nullable(40),
  publicEmail: z.union([z.literal(""), z.email().max(320)]).transform((value) => value || null),
  yearsExperience: z.union([z.literal(""), z.coerce.number().int().min(0).max(70)]).transform((value) => value === "" ? null : value),
  spokenLanguages: z.string().max(300).transform((value) => value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12)),
  acceptsNewPatients: z.boolean(),
});
const workspaceSchema = z.object({
  clinicName: z.string().trim().min(2).max(160),
  clinicCountry: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()),
  city: nullable(120), practiceAddress: nullable(240),
  latitude: nullableNumber.refine((value) => value === null || (value >= -90 && value <= 90)),
  longitude: nullableNumber.refine((value) => value === null || (value >= -180 && value <= 180)),
}).refine((value) => (value.latitude === null) === (value.longitude === null));

function failure(error: unknown): SettingsState {
  if (error instanceof DataAccessError) {
    if (error.code === "unauthorized") return { status: "unauthorized" };
    if (error.code === "invalid_input") return { status: "invalid" };
  }
  return { status: "unavailable" };
}

export async function updateDoctorProfileAction(_state: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = profileSchema.safeParse({
    professionalBio: formData.get("professionalBio"), publicPhone: formData.get("publicPhone"),
    publicEmail: formData.get("publicEmail"), yearsExperience: formData.get("yearsExperience"),
    spokenLanguages: formData.get("spokenLanguages"), acceptsNewPatients: formData.get("acceptsNewPatients") === "on",
  });
  if (!parsed.success) return { status: "invalid" };
  try {
    await updateDoctorProfile(parsed.data);
    revalidatePath("/doctor/settings"); revalidatePath("/"); revalidatePath("/appointments");
    return { status: "saved" };
  } catch (error) { return failure(error); }
}

export async function updateWorkspaceAction(_state: SettingsState, formData: FormData): Promise<SettingsState> {
  const parsed = workspaceSchema.safeParse({
    clinicName: formData.get("clinicName"), clinicCountry: formData.get("clinicCountry"),
    city: formData.get("city"), practiceAddress: formData.get("practiceAddress"),
    latitude: formData.get("latitude"), longitude: formData.get("longitude"),
  });
  if (!parsed.success) return { status: "invalid" };
  try {
    await updateIndependentWorkspace(parsed.data);
    revalidatePath("/doctor/settings"); revalidatePath("/"); revalidatePath("/appointments");
    return { status: "saved" };
  } catch (error) { return failure(error); }
}
