import { getCustomerAccess } from "@/lib/dal/platform-access";
import { loadMyVehicleServiceHistory } from "@/lib/dal/vehicle-service-history";
import { createVehicleServiceHistoryPdf } from "@/lib/pdf/vehicle-service-history";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: RouteContext<"/api/vehicles/[vehicleId]/service-history">) {
  const access = await getCustomerAccess(); if (access.state !== "active") return Response.json({ error: "unauthorized" }, { status: 401 });
  try { const { vehicleId } = await context.params; const history = await loadMyVehicleServiceHistory(vehicleId); const pdf = await createVehicleServiceHistoryPdf(history.vehicle, history.records); const filename = `pitster-${history.vehicle.registrationNumber.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-service-history.pdf`; return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "private, no-store" } }); }
  catch { return Response.json({ error: "not_found" }, { status: 404 }); }
}
