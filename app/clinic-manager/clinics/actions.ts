"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DataAccessError } from "@/lib/dal/errors";
import { createManagedClinic, updateManagedClinic } from "@/lib/dal/workspaces";

export type ClinicSettingsState = { status: "idle" | "saved" | "created" | "invalid" | "unauthorized" | "unavailable" };
const nullable = (max: number) => z.string().trim().max(max).transform((value) => value || null);
const nullableNumber = z.union([z.literal(""), z.coerce.number()]).transform((value) => value === "" ? null : value);
const common = {
  legalName: z.string().trim().min(2).max(200), displayName: z.string().trim().min(2).max(160),
  countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()),
};
const createSchema = z.object(common);
const updateSchema = z.object({
  ...common, clinicId: z.uuid(), description: nullable(2000), publicPhone: nullable(40),
  publicEmail: z.union([z.literal(""), z.email().max(320)]).transform((value) => value || null),
  city: nullable(120), address: nullable(240),
  latitude: nullableNumber.refine((value) => value === null || (value >= -90 && value <= 90)),
  longitude: nullableNumber.refine((value) => value === null || (value >= -180 && value <= 180)),
}).refine((value) => (value.latitude === null) === (value.longitude === null));

function failure(error: unknown): ClinicSettingsState {
  if (error instanceof DataAccessError) {
    if (error.code === "unauthorized") return { status: "unauthorized" };
    if (error.code === "invalid_input") return { status: "invalid" };
  }
  return { status: "unavailable" };
}

export async function createClinicAction(_state: ClinicSettingsState, formData: FormData): Promise<ClinicSettingsState> {
  const parsed = createSchema.safeParse({ legalName: formData.get("legalName"), displayName: formData.get("displayName"), countryCode: formData.get("countryCode") });
  if (!parsed.success) return { status: "invalid" };
  try { await createManagedClinic(parsed.data); revalidatePath("/clinic-manager"); revalidatePath("/clinic-manager/clinics"); return { status: "created" }; }
  catch (error) { return failure(error); }
}

export async function updateClinicAction(_state: ClinicSettingsState, formData: FormData): Promise<ClinicSettingsState> {
  const parsed = updateSchema.safeParse({
    clinicId: formData.get("clinicId"), legalName: formData.get("legalName"), displayName: formData.get("displayName"),
    countryCode: formData.get("countryCode"), description: formData.get("description"), publicPhone: formData.get("publicPhone"),
    publicEmail: formData.get("publicEmail"), city: formData.get("city"), address: formData.get("address"),
    latitude: formData.get("latitude"), longitude: formData.get("longitude"),
  });
  if (!parsed.success) return { status: "invalid" };
  try {
    await updateManagedClinic({ id: parsed.data.clinicId, ...parsed.data });
    revalidatePath("/clinic-manager"); revalidatePath("/clinic-manager/clinics"); revalidatePath("/"); revalidatePath("/appointments");
    return { status: "saved" };
  } catch (error) { return failure(error); }
}
