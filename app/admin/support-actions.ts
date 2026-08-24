"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminAccess } from "@/lib/dal/admin-auth";
import { DataAccessError } from "@/lib/dal/errors";
import { markAdminSupportTicketSpam, updateAdminSupportTicket } from "@/lib/dal/support-tickets";

const schema = z.object({
  ticketId: z.uuid(),
  status: z.enum(["open", "in_progress", "waiting_on_requester", "resolved", "closed"]),
  internalNote: z.string().trim().max(3000).transform((value) => value || null),
  closureStage: z.enum(["not_applicable", "requested", "account_suspended", "scheduled_for_deletion", "deletion_completed", "cancelled"]),
  closureWaitDays: z.enum(["", "30", "60"]).transform((value) => value ? Number(value) as 30 | 60 : null),
});

export async function updateSupportTicketAction(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const access = await getAdminAccess();
  if (access.state !== "authorized") return;
  await updateAdminSupportTicket(parsed.data);
  revalidatePath("/admin");
  revalidatePath("/admin/support");
}

export type SpamTicketActionState = {
  status: "idle" | "blocked" | "registered_account" | "invalid" | "unauthorized" | "unavailable";
};

const spamSchema = z.object({ ticketId: z.uuid() });

export async function markSupportTicketSpamAction(
  _state: SpamTicketActionState,
  formData: FormData,
): Promise<SpamTicketActionState> {
  const parsed = spamSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  const access = await getAdminAccess();
  if (access.state !== "authorized") return { status: "unauthorized" };
  try {
    await markAdminSupportTicketSpam(parsed.data.ticketId);
    revalidatePath("/admin");
    revalidatePath("/admin/support");
    revalidatePath("/admin/security");
    return { status: "blocked" };
  } catch (error) {
    if (error instanceof DataAccessError) {
      if (error.code === "conflict") return { status: "registered_account" };
      if (error.code === "unauthorized") return { status: "unauthorized" };
      if (error.code === "invalid_input" || error.code === "not_found") return { status: "invalid" };
    }
    return { status: "unavailable" };
  }
}
