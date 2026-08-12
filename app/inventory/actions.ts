"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DataAccessError } from "@/lib/dal/errors";
import {
  createWorkshopInventoryItem,
  updateWorkshopInventoryItem,
} from "@/lib/dal/workshop-inventory";

export type InventoryActionState = {
  status: "idle" | "created" | "saved" | "invalid" | "unauthorized" | "conflict" | "unavailable";
};

const optionalText = (maximum: number) => z.string().trim().max(maximum).transform((value) => value || null);
const quantity = z.coerce.number().min(0).max(100000000);
const fields = {
  itemName: z.string().trim().min(2).max(160),
  sku: z.string().trim().min(1).max(80).transform((value) => value.toUpperCase()),
  oemCode: optionalText(100),
  itemType: z.enum(["part", "consumable"]),
  quantity,
  minimumQuantity: quantity,
  unit: z.enum(["piece", "litre", "kilogram", "set", "pack"]),
  manufacturer: optionalText(120),
  vehicleApplication: optionalText(240),
  storageLocation: optionalText(120),
  notes: optionalText(1000),
};
const createSchema = z.object({ workshopId: z.uuid(), ...fields });
const updateSchema = z.object({ inventoryId: z.uuid(), ...fields });

function values(formData: FormData) {
  return {
    itemName: formData.get("itemName"),
    sku: formData.get("sku"),
    oemCode: formData.get("oemCode") ?? "",
    itemType: formData.get("itemType"),
    quantity: formData.get("quantity"),
    minimumQuantity: formData.get("minimumQuantity") || "0",
    unit: formData.get("unit"),
    manufacturer: formData.get("manufacturer") ?? "",
    vehicleApplication: formData.get("vehicleApplication") ?? "",
    storageLocation: formData.get("storageLocation") ?? "",
    notes: formData.get("notes") ?? "",
  };
}

function refresh() {
  revalidatePath("/workshop-manager/inventory");
  revalidatePath("/service-organisation/inventory");
}

function failure(error: unknown): InventoryActionState {
  if (error instanceof DataAccessError) {
    if (error.code === "unauthorized") return { status: "unauthorized" };
    if (error.code === "conflict") return { status: "conflict" };
    if (error.code === "invalid_input") return { status: "invalid" };
  }
  return { status: "unavailable" };
}

export async function createInventoryItemAction(
  _state: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const parsed = createSchema.safeParse({ workshopId: formData.get("workshopId"), ...values(formData) });
  if (!parsed.success) return { status: "invalid" };
  try {
    const { workshopId, ...input } = parsed.data;
    await createWorkshopInventoryItem(workshopId, input);
    refresh();
    return { status: "created" };
  } catch (error) {
    return failure(error);
  }
}

export async function updateInventoryItemAction(
  _state: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const parsed = updateSchema.safeParse({ inventoryId: formData.get("inventoryId"), ...values(formData) });
  if (!parsed.success) return { status: "invalid" };
  try {
    const { inventoryId, ...input } = parsed.data;
    await updateWorkshopInventoryItem(inventoryId, input);
    refresh();
    return { status: "saved" };
  } catch (error) {
    return failure(error);
  }
}
