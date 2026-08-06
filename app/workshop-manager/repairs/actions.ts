"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DataAccessError } from "@/lib/dal/errors";
import { manageRepairWorkflow } from "@/lib/dal/repair-workflows";

export type RepairActionState = {
  status: "idle" | "saved" | "invalid" | "unauthorized" | "unavailable";
};

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
    revalidatePath("/workshop-manager/repairs");
    revalidatePath("/customer/bookings");
    revalidatePath("/garage");
    return { status: "saved" };
  } catch (error) { return failure(error); }
}
