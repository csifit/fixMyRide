import { loadMyWorkshopInventory } from "@/lib/dal/workshop-inventory";

export const dynamic = "force-dynamic";
const columns = ["itemName", "sku", "oemCode", "itemType", "quantity", "minimumQuantity", "unit", "manufacturer", "vehicleApplication", "supplier", "purchasePrice", "sellingPrice", "currency", "storageLocation", "notes"] as const;
const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(_request: Request, context: RouteContext<"/api/inventory/[workshopId]/export">) {
  const { workshopId } = await context.params;
  const inventory = (await loadMyWorkshopInventory()).find((entry) => entry.workshopId === workshopId);
  if (!inventory) return Response.json({ error: "not_found" }, { status: 404 });
  const rows = inventory.items.map((item) => ({ ...item, purchasePrice: item.purchasePriceCents === null ? "" : (item.purchasePriceCents / 100).toFixed(2), sellingPrice: item.sellingPriceCents === null ? "" : (item.sellingPriceCents / 100).toFixed(2) }));
  const body = [columns.join(","), ...rows.map((row) => columns.map((column) => csv(row[column])).join(","))].join("\r\n");
  return new Response(`\uFEFF${body}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="pitster-${workshopId}-inventory.csv"`, "cache-control": "private, no-store" } });
}
