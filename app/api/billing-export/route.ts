import { NextRequest, NextResponse } from "next/server";
import { getAccountingAccess } from "@/lib/dal/admin-auth";
import { getOrganizationAccess } from "@/lib/dal/organization";
import { loadClinicBillingUsage, loadPlatformBillingUsage } from "@/lib/dal/invoicing";
import { loadCommercialAdmin } from "@/lib/dal/commercial-admin";

export const dynamic = "force-dynamic";

function csvCell(value: string | number) {
  const text = String(value);
  return /[";,\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows: Array<Array<string | number>>) {
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
}

function download(body: string, name: string) {
  return new NextResponse(body, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "private, no-store",
  }});
}

export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get("scope");
  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (scope === "commercial") {
    const access = await getAccountingAccess();
    if (access.state !== "authorized") return new NextResponse("Unauthorized", { status: 401 });
    const data = await loadCommercialAdmin();
    const output: Array<Array<string | number>> = [["Provider ID", "Provider", "Location ID", "Location", "City", "Provider status", "Workshop status", "Subscription status", "Monthly price", "Currency", "Period end", "Grace end", "Invoices", "Last invoice status"]];
    for (const location of data.locations) output.push([location.providerId, location.providerName, location.id, location.displayName, location.city ?? "", location.providerStatus, location.workshopStatus, location.subscriptionStatus, (location.monthlyPriceCents / 100).toFixed(2), location.currency, location.currentPeriodEnd ?? "", location.coverageGraceEndsAt ?? "", location.invoiceCount, location.lastInvoiceStatus ?? ""]);
    return download(csv(output), `pitster-location-billing-${new Date().toISOString().slice(0, 10)}.csv`);
  }
  if (!/^\d{4}-\d{2}-01$/.test(month)) return new NextResponse("Invalid month", { status: 400 });
  if (scope === "clinic") {
    const access = await getOrganizationAccess("clinic_manager");
    if (access.state !== "active") return new NextResponse("Unauthorized", { status: 401 });
    const clinicId = request.nextUrl.searchParams.get("clinicId") ?? "";
    const rows = (await loadClinicBillingUsage(clinicId)).filter((row) => row.month === month && row.status === "closed");
    if (!rows.length) return new NextResponse("No closed statement", { status: 404 });
    const output: Array<Array<string | number>> = [["Month", "Doctor", "Subscription EUR", "SMS sent", "SMS unit EUR", "SMS cost EUR", "Total EUR"]];
    for (const row of rows) output.push([row.month, row.clinicianName, (row.subscriptionCents / 100).toFixed(2), row.smsCount, (row.smsUnitCents / 100).toFixed(2), ((row.smsCount * row.smsUnitCents) / 100).toFixed(2), (row.totalCents / 100).toFixed(2)]);
    output.push(["TOTAL", "", "", rows.reduce((sum, row) => sum + row.smsCount, 0), "", "", (rows.reduce((sum, row) => sum + row.totalCents, 0) / 100).toFixed(2)]);
    return download(csv(output), `pitster-clinic-costs-${month.slice(0, 7)}.csv`);
  }
  if (scope === "platform") {
    const access = await getAccountingAccess();
    if (access.state !== "authorized") return new NextResponse("Unauthorized", { status: 401 });
    const rows = (await loadPlatformBillingUsage()).filter((row) => row.month === month);
    const output: Array<Array<string | number>> = [["Month", "Payer type", "Payer", "Doctors", "SMS sent", "Total EUR"]];
    for (const row of rows) output.push([row.month, row.payerKind, row.payerName, row.doctorCount, row.smsCount, (row.totalCents / 100).toFixed(2)]);
    output.push(["TOTAL", "", "", rows.reduce((sum, row) => sum + row.doctorCount, 0), rows.reduce((sum, row) => sum + row.smsCount, 0), (rows.reduce((sum, row) => sum + row.totalCents, 0) / 100).toFixed(2)]);
    return download(csv(output), `pitster-platform-invoicing-${month.slice(0, 7)}.csv`);
  }
  return new NextResponse("Invalid scope", { status: 400 });
}
