"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DataAccessError } from "@/lib/dal/errors";
import { manageRepairWorkflow } from "@/lib/dal/repair-workflows";
import { dispatchDueServiceBookingNotifications } from "@/lib/sms/service-booking-notifications";
import { saveWorkshopVehicleServiceRecord } from "@/lib/dal/vehicle-service-history";
import { updateManagedServiceOrderDetails } from "@/lib/dal/service-orders";
import { dispatchDueBookingCommunications } from "@/lib/messaging/booking-communications";

export type RepairActionState = {
  status: "idle" | "saved" | "invalid" | "unauthorized" | "unavailable";
};
export type ServiceRecordActionState = RepairActionState;
export type ServiceOrderActionState = RepairActionState;

const itemSchema = z.object({
  type: z.enum(["labor", "part", "other"]),
  description: z.string().trim().min(2).max(500),
  quantity: z.number().positive().max(100000),
  unitPriceCents: z.number().int().nonnegative(),
});

const schema = z.object({
  bookingId: z.uuid(),
  action: z.enum(["check_in", "start_diagnosis", "submit_estimate", "start_work", "ready_for_collection", "complete", "mark_no_show"]),
  diagnosis: z.string().trim().max(4000).transform((value) => value || null),
  currency: z.enum(["EUR", "HUF", "RON"]),
  note: z.string().trim().max(2000).transform((value) => value || null),
  items: z.string().transform((value, context) => {
    try { return JSON.parse(value) as unknown; }
    catch { context.addIssue({ code: "custom", message: "invalid_json" }); return z.NEVER; }
  }).pipe(z.array(itemSchema).max(100)),
}).superRefine((value, context) => {
  if (value.action === "submit_estimate" && (!value.diagnosis || value.items.length === 0)) {
    context.addIssue({ code: "custom", message: "estimate_required" });
  }
});

function failure(error: unknown): RepairActionState {
  if (error instanceof DataAccessError) {
    if (error.code === "unauthorized") return { status: "unauthorized" };
    if (error.code === "invalid_input" || error.code === "conflict") return { status: "invalid" };
  }
  return { status: "unavailable" };
}

export async function manageRepairAction(_state: RepairActionState, formData: FormData): Promise<RepairActionState> {
  const parsed = schema.safeParse({
    bookingId: formData.get("bookingId"), action: formData.get("action"),
    diagnosis: formData.get("diagnosis") ?? "", currency: formData.get("currency") ?? "EUR",
    note: formData.get("note") ?? "", items: formData.get("items") ?? "[]",
  });
  if (!parsed.success) return { status: "invalid" };
  try {
    await manageRepairWorkflow(parsed.data);
    await Promise.allSettled([
      dispatchDueServiceBookingNotifications(parsed.data.bookingId),
      dispatchDueBookingCommunications(parsed.data.bookingId),
    ]);
    revalidatePath("/workshop-manager/repairs");
    revalidatePath("/service-organisation/repairs");
    revalidatePath("/customer/bookings");
    revalidatePath("/garage");
    return { status: "saved" };
  } catch (error) { return failure(error); }
}

const serviceRecordSchema = z.object({
  bookingId: z.uuid(),
  mileageKm: z.union([z.literal("").transform(() => null), z.coerce.number().int().min(0).max(5_000_000)]),
  workSummary: z.string().trim().max(5000).transform((value) => value || null),
  inspectionSummary: z.string().trim().max(5000).transform((value) => value || null),
  invoiceNumber: z.string().trim().max(80).transform((value) => value || null),
  invoiceIssuedOn: z.union([z.literal("").transform(() => null), z.iso.date()]),
  invoiceTotal: z.union([z.literal("").transform(() => null), z.coerce.number().nonnegative().max(100_000_000)]),
  invoiceCurrency: z.union([z.literal("").transform(() => null), z.enum(["EUR", "RON", "HUF"])]),
  parts: z.string().transform((value, context) => { try { return JSON.parse(value) as unknown; } catch { context.addIssue({ code: "custom", message: "invalid_json" }); return z.NEVER; } }).pipe(z.array(z.object({
    description: z.string().trim().min(2).max(500), partNumber: z.string().trim().max(120).nullable(),
    quantity: z.number().positive().max(10000), warrantyExpiresOn: z.iso.date().nullable(),
  })).max(100)),
  recommendations: z.string().transform((value, context) => { try { return JSON.parse(value) as unknown; } catch { context.addIssue({ code: "custom", message: "invalid_json" }); return z.NEVER; } }).pipe(z.array(z.object({
    description: z.string().trim().min(2).max(500), dueOn: z.iso.date().nullable(),
    dueMileageKm: z.number().int().min(0).max(5_000_000).nullable(),
  })).max(100)),
});

export async function saveVehicleServiceRecordAction(_state: ServiceRecordActionState, formData: FormData): Promise<ServiceRecordActionState> {
  const parsed = serviceRecordSchema.safeParse({
    ...Object.fromEntries(formData),
    invoiceNumber: formData.get("invoiceNumber") ?? "",
    invoiceIssuedOn: formData.get("invoiceIssuedOn") ?? "",
    invoiceTotal: formData.get("invoiceTotal") ?? "",
    invoiceCurrency: formData.get("invoiceCurrency") ?? "",
  });
  if (!parsed.success) return { status: "invalid" };
  try {
    await saveWorkshopVehicleServiceRecord({
      ...parsed.data,
      invoiceTotalCents: parsed.data.invoiceTotal === null ? null : Math.round(parsed.data.invoiceTotal * 100),
    });
    revalidatePath("/workshop-manager/repairs");
    revalidatePath("/service-organisation/repairs");
    revalidatePath("/garage");
    return { status: "saved" };
  } catch (error) { return failure(error); }
}

const serviceOrderSchema = z.object({
  bookingId: z.uuid(),
  mechanicOverride: z.string().trim().max(160).transform((value) => value || null),
  receptionCondition: z.string().trim().max(2000).transform((value) => value || null),
});

export async function updateServiceOrderAction(
  _state: ServiceOrderActionState,
  formData: FormData,
): Promise<ServiceOrderActionState> {
  const parsed = serviceOrderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    await updateManagedServiceOrderDetails(parsed.data);
    revalidatePath("/workshop-manager/repairs");
    revalidatePath("/service-organisation/repairs");
    return { status: "saved" };
  } catch (error) { return failure(error); }
}
