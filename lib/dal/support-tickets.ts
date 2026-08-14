import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type SupportTicketType = "support" | "problem";
export type SupportRequesterType = "customer" | "service_organisation" | "workshop_manager" | "other";
export type SupportTicketStatus = "open" | "in_progress" | "waiting_on_requester" | "resolved" | "closed";

export type SupportTicket = {
  id: string;
  reference: string;
  ticketType: SupportTicketType;
  requesterType: SupportRequesterType;
  requesterName: string;
  requesterEmail: string;
  subject: string;
  description: string;
  pageUrl: string | null;
  status: SupportTicketStatus;
  internalNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function createSupportTicket(input: {
  ticketType: SupportTicketType;
  requesterType: SupportRequesterType;
  requesterName: string;
  requesterEmail: string;
  subject: string;
  description: string;
  pageUrl: string | null;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_support_ticket", {
    requested_ticket_type: input.ticketType,
    requested_requester_type: input.requesterType,
    requested_requester_name: input.requesterName,
    requested_requester_email: input.requesterEmail,
    requested_subject: input.subject,
    requested_description: input.description,
    requested_page_url: input.pageUrl,
  });
  if (error || !data) throw new DataAccessError(classifyDatabaseError(error ?? {}));
  const result = data as Record<string, unknown>;
  if (result.state === "rate_limited") throw new DataAccessError("rate_limited");
  if (result.state !== "created" || typeof result.reference !== "string") {
    throw new DataAccessError("unavailable");
  }
  return { reference: result.reference };
}

export async function loadAdminSupportTickets(): Promise<SupportTicket[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("support_tickets")
    .select("id, reference, ticket_type, requester_type, requester_name, requester_email, subject, description, page_url, status, internal_note, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  return (data ?? []).map((row) => ({
    id: row.id,
    reference: row.reference,
    ticketType: row.ticket_type as SupportTicketType,
    requesterType: row.requester_type as SupportRequesterType,
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
    subject: row.subject,
    description: row.description,
    pageUrl: row.page_url,
    status: row.status as SupportTicketStatus,
    internalNote: row.internal_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function updateAdminSupportTicket(input: {
  ticketId: string;
  status: SupportTicketStatus;
  internalNote: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("support_tickets").update({
    status: input.status,
    internal_note: input.internalNote,
  }).eq("id", input.ticketId);
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}

