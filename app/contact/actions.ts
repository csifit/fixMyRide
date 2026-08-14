"use server";

import { z } from "zod";
import { createSupportTicket } from "@/lib/dal/support-tickets";
import { DataAccessError } from "@/lib/dal/errors";

const schema = z.object({
  ticketType: z.enum(["support", "problem"]),
  requesterType: z.enum(["customer", "service_organisation", "workshop_manager", "other"]),
  requesterName: z.string().trim().min(2).max(120),
  requesterEmail: z.email().max(254),
  subject: z.string().trim().min(4).max(160),
  description: z.string().trim().min(20).max(5000),
  pageUrl: z.union([z.literal(""), z.url().max(1000)]).transform((value) => value || null),
  companyWebsite: z.literal(""),
});

export type ContactTicketState =
  | { status: "idle" }
  | { status: "created"; reference: string }
  | { status: "invalid" | "rate_limited" | "unavailable" };

export async function createContactTicketAction(
  _state: ContactTicketState,
  formData: FormData,
): Promise<ContactTicketState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    const ticket = await createSupportTicket(parsed.data);
    return { status: "created", reference: ticket.reference };
  } catch (error) {
    if (error instanceof DataAccessError && error.code === "rate_limited") {
      return { status: "rate_limited" };
    }
    return { status: "unavailable" };
  }
}

