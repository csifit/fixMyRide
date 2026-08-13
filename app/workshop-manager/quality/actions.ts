"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DataAccessError } from "@/lib/dal/errors";
import {
  createWorkshopWarrantyCase, loadMaintenanceOutreachContext,
  recordMaintenanceOutreach, resolveWorkshopWarrantyCase, setWorkshopJobWarranty,
} from "@/lib/dal/workshop-quality";
import { sendMaintenanceReminderEmail } from "@/lib/email/maintenance-reminders";

export type QualityActionState = { status: "idle" | "saved" | "sent" | "failed" | "invalid" | "unauthorized" | "unavailable"; diagnostic?: string };
const warrantySchema = z.object({ bookingId: z.uuid(), labourWarrantyExpiresOn: z.union([z.literal("").transform(() => null), z.iso.date()]) });
const caseSchema = z.object({ originalBookingId: z.uuid(), returnBookingId: z.uuid(), kind: z.enum(["warranty", "comeback"]), technicianResourceId: z.union([z.literal("").transform(() => null), z.uuid()]), internalNotes: z.string().trim().max(5000).transform((value) => value || null) });
const resolutionSchema = z.object({ caseId: z.uuid(), resolution: z.string().trim().min(2).max(5000), internalNotes: z.string().trim().max(5000).transform((value) => value || null) });
const outreachSchema = z.object({ recommendationId: z.uuid(), channel: z.enum(["phone", "email", "in_app"]), phoneStatus: z.enum(["contacted", "not_reached"]).default("contacted"), note: z.string().trim().max(1000).transform((value) => value || null) });

function failure(error: unknown): QualityActionState {
  if (error instanceof DataAccessError) {
    if (error.code === "unauthorized") return { status: "unauthorized" };
    if (error.code === "invalid_input" || error.code === "conflict") return { status: "invalid" };
  }
  return { status: "unavailable" };
}
function refresh() { revalidatePath("/workshop-manager/quality"); revalidatePath("/service-organisation"); revalidatePath("/customer/bookings"); }

export async function saveJobWarrantyAction(_state: QualityActionState, formData: FormData): Promise<QualityActionState> {
  const parsed = warrantySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try { await setWorkshopJobWarranty(parsed.data.bookingId, parsed.data.labourWarrantyExpiresOn); refresh(); return { status: "saved" }; }
  catch (error) { return failure(error); }
}

export async function createWarrantyCaseAction(_state: QualityActionState, formData: FormData): Promise<QualityActionState> {
  const parsed = caseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try { await createWorkshopWarrantyCase(parsed.data); refresh(); return { status: "saved" }; }
  catch (error) { return failure(error); }
}

export async function resolveWarrantyCaseAction(_state: QualityActionState, formData: FormData): Promise<QualityActionState> {
  const parsed = resolutionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try { await resolveWorkshopWarrantyCase(parsed.data.caseId, parsed.data.resolution, parsed.data.internalNotes); refresh(); return { status: "saved" }; }
  catch (error) { return failure(error); }
}

export async function maintenanceOutreachAction(_state: QualityActionState, formData: FormData): Promise<QualityActionState> {
  const parsed = outreachSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    if (parsed.data.channel === "email") {
      const context = await loadMaintenanceOutreachContext(parsed.data.recommendationId);
      const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://www.pitster.app";
      const delivery = await sendMaintenanceReminderEmail({
        to: context.customerEmail, customerName: context.customerName,
        workshopName: context.workshopName, vehicleRegistration: context.vehicleRegistration,
        description: context.description, dueOn: context.dueOn,
        bookingUrl: `${origin}/workshops/${context.workshopSlug}#appointment`,
      });
      await recordMaintenanceOutreach({ recommendationId: parsed.data.recommendationId, channel: "email", status: delivery.delivery === "sent" ? "sent" : "failed", note: delivery.diagnostic ?? parsed.data.note });
      refresh();
      return { status: delivery.delivery === "sent" ? "sent" : "failed", diagnostic: delivery.diagnostic };
    }
    await recordMaintenanceOutreach({ recommendationId: parsed.data.recommendationId, channel: parsed.data.channel, status: parsed.data.channel === "phone" ? parsed.data.phoneStatus : "sent", note: parsed.data.note });
    refresh(); return { status: parsed.data.channel === "in_app" ? "sent" : "saved" };
  } catch (error) { return failure(error); }
}

