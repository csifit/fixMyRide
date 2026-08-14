"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminAccess } from "@/lib/dal/admin-auth";
import { updateAdminSupportTicket } from "@/lib/dal/support-tickets";

const schema = z.object({
  ticketId: z.uuid(),
  status: z.enum(["open", "in_progress", "waiting_on_requester", "resolved", "closed"]),
  internalNote: z.string().trim().max(3000).transform((value) => value || null),
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

