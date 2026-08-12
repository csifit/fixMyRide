import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type WorkshopInventoryItemType = "part" | "consumable";
export type WorkshopInventoryUnit = "piece" | "litre" | "kilogram" | "set" | "pack";

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
  storageLocation: string | null;
  notes: string | null;
};

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadMyWorkshopInventory(): Promise<WorkshopInventory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_workshop_inventory");
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
    new_storage_location: input.storageLocation,
    new_notes: input.notes,
  };
}

export async function createWorkshopInventoryItem(workshopId: string, input: WorkshopInventoryInput) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_workshop_inventory_item", {
    requested_workshop_id: workshopId,
    ...inventoryArguments(input),
  });
  if (error) fail(error);
}

export async function updateWorkshopInventoryItem(inventoryId: string, input: WorkshopInventoryInput) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_workshop_inventory_item", {
    requested_inventory_id: inventoryId,
    ...inventoryArguments(input),
  });
  if (error) fail(error);
}
