import { mkdir, writeFile } from "node:fs/promises";
import { createServiceOrderPdf } from "../lib/pdf/service-order.ts";

const order = {
  bookingId: "573f1e23-8818-47be-8687-d5c6f16f6abf",
  orderNumber: "SO-20260817-000042",
  status: "checked_in",
  createdAt: "2026-08-17T07:15:00.000Z",
  confirmedStart: "2026-08-17T08:30:00.000Z",
  durationMinutes: 120,
  workshop: {
    name: "Pitster Central Workshop",
    organisation: "Pitster Service Organisation",
    address: "Strada Atelierului 12",
    city: "Cluj-Napoca",
    phone: "+40 700 123 456",
    email: "workshop@example.com",
  },
  customer: { name: "Andrei Popescu", phone: "+40 700 555 111", email: "andrei@example.com" },
  vehicle: {
    registration: "CJ-12-ABC", make: "Volkswagen", model: "Golf", year: 2021,
    vin: "WVWZZZ1JZXW000001", mileageKm: 68420,
  },
  serviceName: "Diagnose",
  customerNote: "Intermittent engine warning light and reduced power when accelerating uphill.",
  workshopNote: "Customer requested a call before any work outside the approved estimate.",
  mechanicOverride: "Alex Ionescu",
  receptionCondition: "Small scratch on left rear door. Fuel level approximately one half. Warning light visible at arrival.",
  resources: [
    { kind: "mechanic", name: "Mechanic team A" },
    { kind: "bay", name: "Station 2" },
  ],
  estimate: {
    status: "approved", diagnosis: "Stored boost-pressure fault. Inspect intake hoses and actuator operation.",
    currency: "EUR", totalCents: 18500,
    items: [
      { type: "labor", description: "Diagnosis and pressure test", quantity: 1, lineTotalCents: 6500 },
      { type: "part", description: "Intake pressure hose", quantity: 1, lineTotalCents: 12000 },
    ],
  },
  serviceRecord: {
    workSummary: null,
    inspectionSummary: "Visual inspection found oil mist around the upper intake hose connection.",
    parts: [{ description: "Intake pressure hose", partNumber: "5Q0-145-838", quantity: 1, warrantyExpiresOn: "2027-08-17" }],
    recommendations: [{ description: "Annual engine service", dueOn: "2027-08-01", dueMileageKm: 82000 }],
  },
};

await mkdir("output/pdf", { recursive: true });
const pdf = await createServiceOrderPdf(order);
await writeFile("output/pdf/pitster-service-order-sample.pdf", pdf);
console.log("output/pdf/pitster-service-order-sample.pdf");
