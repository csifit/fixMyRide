import { getServiceOrganisationAccess } from "@/lib/dal/platform-access";
import { loadServiceOrganisationOperationalDashboard } from "@/lib/dal/service-organisation-dashboard";

export const dynamic = "force-dynamic";
const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(_request: Request, context: RouteContext<"/api/service-organisation/[providerId]/monthly-report">) {
  const access = await getServiceOrganisationAccess();
  if (access.state !== "active") return Response.json({ error: "unauthorized" }, { status: 401 });
  const { providerId } = await context.params;
  if (!access.organisationIds.includes(providerId)) return Response.json({ error: "forbidden" }, { status: 403 });
  const dashboard = await loadServiceOrganisationOperationalDashboard(providerId);
  const header = ["month", "appointments", "completedJobs", "workloadHours", "revenue", "cancellationRatePercent", "averageRating"];
  const rows = dashboard.months.map((month) => [month.month, month.appointments, month.completedJobs, (month.workloadMinutes / 60).toFixed(1), Object.entries(month.revenueByCurrency).map(([currency, cents]) => `${(cents / 100).toFixed(2)} ${currency}`).join(" | "), month.cancellationRate.toFixed(1), month.averageRating?.toFixed(2) ?? ""]);
  const body = [header.join(","), ...rows.map((row) => row.map(csv).join(","))].join("\r\n");
  return new Response(`\uFEFF${body}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="pitster-${providerId}-monthly-report.csv"`, "cache-control": "private, no-store" } });
}
