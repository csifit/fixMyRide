import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ServiceOrder } from "@/lib/dal/service-orders";

const PAGE = { width: 595.28, height: 841.89, margin: 38 };
const teal = rgb(0, 0.43, 0.43);
const ink = rgb(0.08, 0.18, 0.17);
const muted = rgb(0.39, 0.48, 0.46);
const line = rgb(0.79, 0.87, 0.84);
const pale = rgb(0.95, 0.98, 0.97);
const warning = rgb(0.98, 0.95, 0.85);
const ascii = (value: string | number | null | undefined) => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "-");

function wrappedLines(value: string | null | undefined, font: PDFFont, size: number, width: number) {
  const paragraphs = ascii(value || "-").split(/\r?\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words.length ? words : ["-"]) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) current = candidate;
      else { if (current) lines.push(current); current = word; }
    }
    lines.push(current || "-");
  }
  return lines;
}

function drawLines(page: PDFPage, values: string[], x: number, y: number, font: PDFFont, size: number, color = ink, leading = size + 3) {
  values.forEach((value, index) => page.drawText(value, { x, y: y - index * leading, size, font, color }));
  return y - values.length * leading;
}

function label(page: PDFPage, text: string, x: number, y: number, font: PDFFont) {
  page.drawText(ascii(text).toUpperCase(), { x, y, size: 7, font, color: muted });
}

function section(page: PDFPage, title: string, y: number, bold: PDFFont) {
  page.drawRectangle({ x: PAGE.margin, y: y - 4, width: PAGE.width - PAGE.margin * 2, height: 20, color: pale });
  page.drawText(ascii(title).toUpperCase(), { x: PAGE.margin + 8, y: y + 2, size: 8, font: bold, color: teal });
  return y - 15;
}

function writeArea(page: PDFPage, x: number, y: number, width: number, height: number, font: PDFFont, value?: string | null) {
  page.drawRectangle({ x, y: y - height, width, height, borderColor: line, borderWidth: .7 });
  if (value) drawLines(page, wrappedLines(value, font, 8, width - 12).slice(0, Math.floor((height - 10) / 11)), x + 6, y - 12, font, 8);
  else for (let lineY = y - 18; lineY > y - height + 8; lineY -= 17) page.drawLine({ start: { x: x + 7, y: lineY }, end: { x: x + width - 7, y: lineY }, thickness: .35, color: line });
}

function header(page: PDFPage, order: ServiceOrder, regular: PDFFont, bold: PDFFont, pageNumber: number) {
  const top = PAGE.height - PAGE.margin;
  page.drawText("pitster", { x: PAGE.margin, y: top, size: 18, font: bold, color: teal });
  page.drawText("SERVICE ORDER", { x: 414, y: top + 3, size: 10, font: bold, color: muted });
  page.drawText(ascii(order.orderNumber || order.bookingId), { x: 414, y: top - 12, size: 8, font: regular, color: ink });
  page.drawLine({ start: { x: PAGE.margin, y: top - 24 }, end: { x: PAGE.width - PAGE.margin, y: top - 24 }, thickness: 1, color: teal });
  page.drawText(`Page ${pageNumber}`, { x: PAGE.width - PAGE.margin - 36, y: 20, size: 7, font: regular, color: muted });
}

export async function createServiceOrderPdf(order: ServiceOrder) {
  const document = await PDFDocument.create();
  document.setTitle(`${ascii(order.orderNumber)} service order`);
  document.setAuthor("pitster");
  document.setCreator("pitster");
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const page1 = document.addPage([PAGE.width, PAGE.height]);
  const page2 = document.addPage([PAGE.width, PAGE.height]);
  header(page1, order, regular, bold, 1);
  header(page2, order, regular, bold, 2);

  let y = PAGE.height - 85;
  page1.drawText(ascii(order.workshop.name), { x: PAGE.margin, y, size: 18, font: bold, color: ink });
  page1.drawText(ascii(order.workshop.organisation), { x: PAGE.margin, y: y - 15, size: 8, font: regular, color: muted });
  const address = [order.workshop.address, order.workshop.city].filter(Boolean).join(", ");
  page1.drawText(ascii([address, order.workshop.phone, order.workshop.email].filter(Boolean).join("  |  ")), { x: PAGE.margin, y: y - 29, size: 7, font: regular, color: muted });
  y -= 55;

  y = section(page1, "Appointment and assignment", y, bold);
  const appointment = order.confirmedStart ? new Date(order.confirmedStart).toLocaleString("en-GB", { timeZone: "Europe/Bucharest" }) : "Not scheduled";
  label(page1, "Appointment", PAGE.margin, y, bold);
  page1.drawText(ascii(appointment), { x: PAGE.margin, y: y - 13, size: 9, font: regular, color: ink });
  label(page1, "Estimated duration", 225, y, bold);
  page1.drawText(`${order.durationMinutes} minutes`, { x: 225, y: y - 13, size: 9, font: regular, color: ink });
  label(page1, "Status", 410, y, bold);
  page1.drawText(ascii(order.status.replaceAll("_", " ").toUpperCase()), { x: 410, y: y - 13, size: 8, font: bold, color: teal });
  y -= 40;
  const structured = order.resources.map((resource) => `${resource.kind}: ${resource.name}`).join("  |  ") || "No structured resource assigned";
  label(page1, "Structured calendar resources", PAGE.margin, y, bold);
  page1.drawText(ascii(structured), { x: PAGE.margin, y: y - 13, size: 8, font: regular, color: ink });
  label(page1, "Printed mechanic override", PAGE.margin, y - 31, bold);
  page1.drawText(ascii(order.mechanicOverride || "-"), { x: PAGE.margin, y: y - 44, size: 9, font: bold, color: ink });
  page1.drawText("Calendar resources remain authoritative for capacity and conflicts.", { x: 285, y: y - 44, size: 7, font: regular, color: muted });
  y -= 70;

  y = section(page1, "Customer and vehicle", y, bold);
  label(page1, "Customer", PAGE.margin, y, bold);
  page1.drawText(ascii(order.customer.name), { x: PAGE.margin, y: y - 13, size: 10, font: bold, color: ink });
  page1.drawText(ascii(`${order.customer.phone}  |  ${order.customer.email}`), { x: PAGE.margin, y: y - 27, size: 8, font: regular, color: muted });
  label(page1, "Vehicle", 320, y, bold);
  page1.drawText(ascii(`${order.vehicle.make} ${order.vehicle.model}${order.vehicle.year ? ` (${order.vehicle.year})` : ""}`), { x: 320, y: y - 13, size: 10, font: bold, color: ink });
  page1.drawText(ascii(`Registration: ${order.vehicle.registration}`), { x: 320, y: y - 27, size: 8, font: regular, color: muted });
  page1.drawText(ascii(`VIN: ${order.vehicle.vin || "-"}`), { x: 320, y: y - 40, size: 8, font: regular, color: muted });
  page1.drawText(ascii(`Mileage: ${order.vehicle.mileageKm ?? "-"} km`), { x: 320, y: y - 53, size: 8, font: regular, color: muted });
  y -= 78;

  y = section(page1, "Customer request", y, bold);
  page1.drawText(ascii(order.serviceName), { x: PAGE.margin, y: y - 3, size: 10, font: bold, color: ink });
  writeArea(page1, PAGE.margin, y - 13, PAGE.width - PAGE.margin * 2, 62, regular, order.customerNote);
  y -= 87;

  y = section(page1, "Vehicle reception condition", y, bold);
  writeArea(page1, PAGE.margin, y - 3, PAGE.width - PAGE.margin * 2, 66, regular, order.receptionCondition);
  y -= 91;

  y = section(page1, "Diagnosis and approved work", y, bold);
  const diagnosis = order.estimate?.diagnosis || order.serviceRecord?.inspectionSummary;
  writeArea(page1, PAGE.margin, y - 3, PAGE.width - PAGE.margin * 2, 74, regular, diagnosis);
  if (order.estimate) {
    page1.drawRectangle({ x: PAGE.margin, y: y - 98, width: PAGE.width - PAGE.margin * 2, height: 19, color: warning });
    page1.drawText(ascii(`Estimate: ${order.estimate.status}  |  ${order.estimate.currency} ${(order.estimate.totalCents / 100).toFixed(2)}`), { x: PAGE.margin + 7, y: y - 92, size: 8, font: bold, color: ink });
  }

  y = PAGE.height - 112;
  y = section(page2, "Parts and consumables", y, bold);
  const parts = order.serviceRecord?.parts ?? [];
  const estimateParts = order.estimate?.items.filter((item) => item.type === "part") ?? [];
  const partRows = parts.length
    ? parts.map((part) => [part.description, part.partNumber || "-", String(part.quantity), part.warrantyExpiresOn || "-"])
    : estimateParts.map((part) => [part.description, "-", String(part.quantity), "-"]);
  const columns = [PAGE.margin, 300, 395, 455];
  ["DESCRIPTION", "PART / OEM", "QTY", "WARRANTY"].forEach((text, index) => label(page2, text, columns[index], y, bold));
  y -= 13;
  const displayedRows = partRows.slice(0, 7);
  for (let index = 0; index < Math.max(displayedRows.length, 4); index += 1) {
    const row = displayedRows[index] ?? ["", "", "", ""];
    page2.drawLine({ start: { x: PAGE.margin, y: y - 14 }, end: { x: PAGE.width - PAGE.margin, y: y - 14 }, thickness: .5, color: line });
    row.forEach((value, columnIndex) => page2.drawText(ascii(value).slice(0, columnIndex === 0 ? 45 : 17), { x: columns[columnIndex], y: y - 8, size: 7, font: regular, color: ink }));
    y -= 20;
  }
  y -= 9;

  y = section(page2, "Work performed and mechanic notes", y, bold);
  writeArea(page2, PAGE.margin, y - 3, PAGE.width - PAGE.margin * 2, 86, regular, order.serviceRecord?.workSummary || order.workshopNote);
  y -= 111;
  label(page2, "Start time", PAGE.margin, y, bold);
  page2.drawText("____________________", { x: PAGE.margin, y: y - 15, size: 9, font: regular, color: ink });
  label(page2, "Completion time", 220, y, bold);
  page2.drawText("____________________", { x: 220, y: y - 15, size: 9, font: regular, color: ink });
  label(page2, "Mileage out", 400, y, bold);
  page2.drawText("________________", { x: 400, y: y - 15, size: 9, font: regular, color: ink });
  y -= 47;

  y = section(page2, "Quality control and test drive", y, bold);
  const checks = ["Fluid levels", "Leaks", "Fasteners", "Warning lights", "Road / function test", "Vehicle cleanliness"];
  checks.forEach((check, index) => {
    const x = PAGE.margin + (index % 2) * 260;
    const rowY = y - 7 - Math.floor(index / 2) * 23;
    page2.drawRectangle({ x, y: rowY - 2, width: 10, height: 10, borderColor: muted, borderWidth: .8 });
    page2.drawText(check, { x: x + 17, y: rowY, size: 8, font: regular, color: ink });
  });
  y -= 85;

  y = section(page2, "Recommendations and next service", y, bold);
  const recommendations = order.serviceRecord?.recommendations.map((item) => {
    const due = [item.dueOn, item.dueMileageKm ? `${item.dueMileageKm} km` : null].filter(Boolean).join(" / ");
    return `${item.description}${due ? ` - ${due}` : ""}`;
  }).join("\n");
  writeArea(page2, PAGE.margin, y - 3, PAGE.width - PAGE.margin * 2, 69, regular, recommendations);
  y -= 94;

  y = section(page2, "Handover and signatures", y, bold);
  const signatures = ["Mechanic", "Workshop manager", "Customer / vehicle handover"];
  signatures.forEach((signature, index) => {
    const width = 162;
    const x = PAGE.margin + index * 178;
    label(page2, signature, x, y, bold);
    page2.drawLine({ start: { x, y: y - 36 }, end: { x: x + width, y: y - 36 }, thickness: .7, color: muted });
    page2.drawText("Date: ______________", { x, y: y - 49, size: 7, font: regular, color: muted });
  });

  page1.drawText("Internal workshop document - customer booking terminology is unchanged.", { x: PAGE.margin, y: 20, size: 7, font: regular, color: muted });
  page2.drawText("Internal workshop document - retain according to workshop policy.", { x: PAGE.margin, y: 20, size: 7, font: regular, color: muted });
  header(page2, order, regular, bold, 2);
  return document.save();
}
