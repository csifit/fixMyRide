"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DataAccessError } from "@/lib/dal/errors";
import {
  createManagedWorkshopService,
  setManagedWorkshopServiceActive,
  updateManagedWorkshopService,
} from "@/lib/dal/workshop-services";

export type ServiceCatalogueState = {
  status: "idle" | "saved" | "created" | "published" | "archived" | "invalid" | "unauthorized" | "conflict" | "unavailable";
};

const optionalInteger = (minimum: number, maximum: number) => z.union([
  z.literal("").transform(() => null),
  z.coerce.number().int().min(minimum).max(maximum),
]);
const price = z.string().trim().refine(
  (value) => value === "" || /^\d+(?:[.,]\d{1,2})?$/.test(value),
).transform((value) => value === "" ? null : Math.round(Number(value.replace(",", ".")) * 100));
const fields = {
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000).transform((value) => value || null),
  estimatedDurationMinutes: optionalInteger(15, 2880),
  priceFromCents: price,
  currency: z.string().trim().length(3).regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  requiresDiagnosis: z.boolean(),
};
const createSchema = z.object({ clinicId: z.uuid(), ...fields });
const updateSchema = z.object({ serviceId: z.uuid(), displayOrder: z.coerce.number().int().min(0).max(10000), ...fields });
const activeSchema = z.object({ serviceId: z.uuid(), active: z.enum(["true", "false"]).transform((value) => value === "true") });

function values(formData: FormData) {
  return {
    name: formData.get("name"),
    category: formData.get("category"),
    description: formData.get("description"),
    estimatedDurationMinutes: formData.get("estimatedDurationMinutes"),
    priceFromCents: formData.get("price"),
    currency: formData.get("currency"),
    requiresDiagnosis: formData.get("requiresDiagnosis") === "on",
  };
}

function failure(error: unknown): ServiceCatalogueState {
  if (error instanceof DataAccessError) {
    if (error.code === "unauthorized") return { status: "unauthorized" };
    if (error.code === "conflict") return { status: "conflict" };
    if (error.code === "invalid_input") return { status: "invalid" };
  }
  return { status: "unavailable" };
}

function refresh() {
  revalidatePath("/clinic-manager/services");
  revalidatePath("/workshops");
  revalidatePath("/");
}

export async function createServiceAction(_state: ServiceCatalogueState, formData: FormData): Promise<ServiceCatalogueState> {
  const parsed = createSchema.safeParse({ clinicId: formData.get("clinicId"), ...values(formData) });
  if (!parsed.success) return { status: "invalid" };
  try {
    const { clinicId, ...input } = parsed.data;
    await createManagedWorkshopService(clinicId, input);
    refresh();
    return { status: "created" };
  } catch (error) {
    return failure(error);
  }
}

export async function updateServiceAction(_state: ServiceCatalogueState, formData: FormData): Promise<ServiceCatalogueState> {
  const parsed = updateSchema.safeParse({ serviceId: formData.get("serviceId"), displayOrder: formData.get("displayOrder"), ...values(formData) });
  if (!parsed.success) return { status: "invalid" };
  try {
    const { serviceId: id, ...input } = parsed.data;
    await updateManagedWorkshopService({ id, ...input });
    refresh();
    return { status: "saved" };
  } catch (error) {
    return failure(error);
  }
}

export async function setServiceActiveAction(_state: ServiceCatalogueState, formData: FormData): Promise<ServiceCatalogueState> {
  const parsed = activeSchema.safeParse({ serviceId: formData.get("serviceId"), active: formData.get("active") });
  if (!parsed.success) return { status: "invalid" };
  try {
    await setManagedWorkshopServiceActive(parsed.data.serviceId, parsed.data.active);
    refresh();
    return { status: parsed.data.active ? "published" : "archived" };
  } catch (error) {
    return failure(error);
  }
}
