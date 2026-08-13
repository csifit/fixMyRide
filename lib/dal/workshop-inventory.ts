import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type WorkshopInventoryItemType = "part" | "consumable";
export type WorkshopInventoryUnit = "piece" | "litre" | "kilogram" | "set" | "pack";
export type WorkshopInventoryMovementType = "received" | "used" | "corrected" | "returned";

export type WorkshopInventoryItem = {
  id: string;
  workshopId: string;
  itemName: string;
  sku: string;
  oemCode: string | null;
  itemType: WorkshopInventoryItemType;
  quantity: number;
  minimumQuantity: number;
  unit: WorkshopInventoryUnit;
  manufacturer: string | null;
  vehicleApplication: string | null;
  supplier: string | null;
  purchasePriceCents: number | null;
  sellingPriceCents: number | null;
  currency: string;
  storageLocation: string | null;
  notes: string | null;
  updatedAt: string;
};

export type WorkshopInventory = {
  workshopId: string;
  serviceProviderId: string;
  serviceProviderName: string;
  workshopName: string;
  items: WorkshopInventoryItem[];
};

export type WorkshopInventoryInput = {
  itemName: string;
  sku: string;
  oemCode: string | null;
  itemType: WorkshopInventoryItemType;
  quantity: number;
  minimumQuantity: number;
  unit: WorkshopInventoryUnit;
  manufacturer: string | null;
  vehicleApplication: string | null;
  supplier: string | null;
  purchasePriceCents: number | null;
  sellingPriceCents: number | null;
  currency: string;
  storageLocation: string | null;
  notes: string | null;
};

export type WorkshopInventoryMovement = {
  id: string;
  inventoryId: string;
  itemName: string;
  sku: string;
  movementType: WorkshopInventoryMovementType;
  quantityChange: number;
  previousQuantity: number;
  newQuantity: number;
  unit: WorkshopInventoryUnit;
  reason: string | null;
  reference: string | null;
  actorName: string;
  createdAt: string;
};

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadMyWorkshopInventory(): Promise<WorkshopInventory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_workshop_inventory_v2");
  if (error) fail(error);

  const inventories = new Map<string, WorkshopInventory>();
  for (const value of data ?? []) {
    const row = value as Record<string, unknown>;
    const workshopId = row.workshop_id as string;
    const inventory = inventories.get(workshopId) ?? {
      workshopId,
      serviceProviderId: row.service_provider_id as string,
      serviceProviderName: row.service_provider_name as string,
      workshopName: row.workshop_name as string,
      items: [],
    };
    if (row.inventory_id) {
      inventory.items.push({
        id: row.inventory_id as string,
        workshopId,
        itemName: row.item_name as string,
        sku: row.sku as string,
        oemCode: row.oem_code as string | null,
        itemType: row.item_type as WorkshopInventoryItemType,
        quantity: Number(row.quantity),
        minimumQuantity: Number(row.minimum_quantity),
        unit: row.unit as WorkshopInventoryUnit,
        manufacturer: row.manufacturer as string | null,
        vehicleApplication: row.vehicle_application as string | null,
        supplier: row.supplier as string | null,
        purchasePriceCents: row.purchase_price_cents === null ? null : Number(row.purchase_price_cents),
        sellingPriceCents: row.selling_price_cents === null ? null : Number(row.selling_price_cents),
        currency: row.currency as string,
        storageLocation: row.storage_location as string | null,
        notes: row.notes as string | null,
        updatedAt: row.updated_at as string,
      });
    }
    inventories.set(workshopId, inventory);
  }
  return [...inventories.values()];
}

function inventoryArguments(input: WorkshopInventoryInput) {
  return {
    new_item_name: input.itemName,
    new_sku: input.sku,
    new_oem_code: input.oemCode,
    new_item_type: input.itemType,
    new_quantity: input.quantity,
    new_minimum_quantity: input.minimumQuantity,
    new_unit: input.unit,
    new_manufacturer: input.manufacturer,
    new_vehicle_application: input.vehicleApplication,
    new_supplier: input.supplier,
    new_purchase_price_cents: input.purchasePriceCents,
    new_selling_price_cents: input.sellingPriceCents,
    new_currency: input.currency,
    new_storage_location: input.storageLocation,
    new_notes: input.notes,
  };
}

export async function createWorkshopInventoryItem(workshopId: string, input: WorkshopInventoryInput) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_workshop_inventory_item_v2", {
    requested_workshop_id: workshopId,
    ...inventoryArguments(input),
  });
  if (error) fail(error);
}

export async function updateWorkshopInventoryItem(inventoryId: string, input: WorkshopInventoryInput) {
  const supabase = await createClient();
  const { new_quantity: _quantity, ...updateArguments } = inventoryArguments(input);
  void _quantity;
  const { error } = await supabase.rpc("update_workshop_inventory_item_v2", {
    requested_inventory_id: inventoryId,
    ...updateArguments,
  });
  if (error) fail(error);
}

export async function adjustWorkshopInventoryStock(input: {
  inventoryId: string;
  movementType: WorkshopInventoryMovementType;
  quantity: number;
  reason: string | null;
  reference: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_workshop_inventory_stock", {
    requested_inventory_id: input.inventoryId,
    requested_movement_type: input.movementType,
    requested_quantity: input.quantity,
    requested_reason: input.reason,
    requested_reference: input.reference,
  });
  if (error) fail(error);
}

export async function loadMyWorkshopInventoryMovements(workshopId: string): Promise<WorkshopInventoryMovement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_workshop_inventory_movements", {
    requested_workshop_id: workshopId,
    requested_inventory_id: null,
    requested_limit: 500,
  });
  if (error) fail(error);
  return (data ?? []).map((value: unknown) => {
    const row = value as Record<string, unknown>;
    return {
      id: row.movement_id as string,
      inventoryId: row.inventory_id as string,
      itemName: row.item_name as string,
      sku: row.sku as string,
      movementType: row.movement_type as WorkshopInventoryMovementType,
      quantityChange: Number(row.quantity_change),
      previousQuantity: Number(row.previous_quantity),
      newQuantity: Number(row.new_quantity),
      unit: row.unit as WorkshopInventoryUnit,
      reason: row.reason as string | null,
      reference: row.reference as string | null,
      actorName: row.actor_name as string,
      createdAt: row.created_at as string,
    };
  });
}

export async function importWorkshopInventoryItems(workshopId: string, items: WorkshopInventoryInput[]) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("import_workshop_inventory_items", {
    requested_workshop_id: workshopId,
    requested_items: items,
  });
  if (error) fail(error);
}
