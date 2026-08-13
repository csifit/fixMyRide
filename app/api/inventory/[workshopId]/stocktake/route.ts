import { loadMyWorkshopInventory } from "@/lib/dal/workshop-inventory";
import { createInventoryStocktakePdf } from "@/lib/pdf/inventory-stocktake";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: RouteContext<"/api/inventory/[workshopId]/stocktake">) {
  const { workshopId } = await context.params;
  const inventory = (await loadMyWorkshopInventory()).find((entry) => entry.workshopId === workshopId);
  if (!inventory) return Response.json({ error: "not_found" }, { status: 404 });
  const pdf = await createInventoryStocktakePdf(inventory);
  return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="pitster-${workshopId}-stocktake.pdf"`, "cache-control": "private, no-store" } });
}
