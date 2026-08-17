import { loadManagedServiceOrder } from "@/lib/dal/service-orders";
import { DataAccessError } from "@/lib/dal/errors";
import { createServiceOrderPdf } from "@/lib/pdf/service-order";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/service-orders/[bookingId]">,
) {
  const { bookingId } = await context.params;
  try {
    const order = await loadManagedServiceOrder(bookingId);
    const pdf = await createServiceOrderPdf(order);
    const filename = (order.orderNumber || `service-order-${bookingId}`).replace(/[^A-Za-z0-9-]/g, "-");
    return new Response(Buffer.from(pdf), { headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="pitster-${filename}.pdf"`,
      "cache-control": "private, no-store",
    } });
  } catch (error) {
    if (error instanceof DataAccessError && error.code === "unauthorized") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
