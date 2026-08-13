"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DataAccessError } from "@/lib/dal/errors";
import {
  adjustWorkshopInventoryStock,
  createWorkshopInventoryItem,
  importWorkshopInventoryItems,
  updateWorkshopInventoryItem,
} from "@/lib/dal/workshop-inventory";

export type InventoryActionState = {
  status: "idle" | "created" | "saved" | "adjusted" | "imported" | "invalid" | "unauthorized" | "conflict" | "unavailable";
  count?: number;
};

const optionalText = (maximum: number) => z.string().trim().max(maximum).transform((value) => value || null);
const quantity = z.coerce.number().min(0).max(100000000);
const money = z.preprocess(
  (value) => value === "" || value === null ? null : value,
  z.coerce.number().min(0).max(1000000000).nullable(),
).transform((value) => value === null ? null : Math.round(value * 100));
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
  supplier: optionalText(160),
  purchasePriceCents: money,
  sellingPriceCents: money,
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  storageLocation: optionalText(120),
  notes: optionalText(1000),
};
const createSchema = z.object({ workshopId: z.uuid(), ...fields });
const updateSchema = z.object({ inventoryId: z.uuid(), ...fields });
const adjustmentSchema = z.object({
  inventoryId: z.uuid(),
  movementType: z.enum(["received", "used", "corrected", "returned"]),
  quantity,
  reason: optionalText(240),
  reference: optionalText(120),
}).refine((value) => value.movementType === "corrected" || value.quantity > 0);

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
    supplier: formData.get("supplier") ?? "",
    purchasePriceCents: formData.get("purchasePrice") ?? "",
    sellingPriceCents: formData.get("sellingPrice") ?? "",
    currency: formData.get("currency") || "EUR",
    storageLocation: formData.get("storageLocation") ?? "",
    notes: formData.get("notes") ?? "",
  };
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { row.push(field); field = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); field = ""; if (row.some((value) => value.trim())) rows.push(row); row = [];
    } else field += character;
  }
  row.push(field); if (row.some((value) => value.trim())) rows.push(row);
  if (quoted || rows.length < 2 || rows.length > 501) throw new Error("invalid_csv");
  const headers = rows[0].map((value) => value.trim().replace(/^\uFEFF/, ""));
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

const csvRowSchema = z.object({
  itemName: fields.itemName,
  sku: fields.sku,
  oemCode: fields.oemCode,
  itemType: fields.itemType,
  quantity: fields.quantity,
  minimumQuantity: fields.minimumQuantity,
  unit: fields.unit,
  manufacturer: fields.manufacturer,
  vehicleApplication: fields.vehicleApplication,
  supplier: fields.supplier,
  purchasePriceCents: money,
  sellingPriceCents: money,
  currency: fields.currency,
  storageLocation: fields.storageLocation,
  notes: fields.notes,
});

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

export async function adjustInventoryStockAction(
  _state: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const parsed = adjustmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    await adjustWorkshopInventoryStock(parsed.data);
    refresh();
    return { status: "adjusted" };
  } catch (error) {
    return failure(error);
  }
}

export async function importInventoryCsvAction(
  _state: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const workshopId = z.uuid().safeParse(formData.get("workshopId"));
  const file = formData.get("csvFile");
  if (!workshopId.success || !(file instanceof File) || file.size === 0 || file.size > 1_000_000) return { status: "invalid" };
  try {
    const rawRows = parseCsv(await file.text());
    const parsedRows = z.array(csvRowSchema).min(1).max(500).safeParse(rawRows.map((row) => ({
      ...row,
      purchasePriceCents: row.purchasePrice,
      sellingPriceCents: row.sellingPrice,
    })));
    if (!parsedRows.success) return { status: "invalid" };
    await importWorkshopInventoryItems(workshopId.data, parsedRows.data);
    refresh();
    return { status: "imported", count: parsedRows.data.length };
  } catch (error) {
    return error instanceof DataAccessError ? failure(error) : { status: "invalid" };
  }
}
