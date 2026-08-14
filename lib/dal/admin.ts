import "server-only";

import { createClient } from "../supabase/server";
import type { AdministratorContext } from "./admin-auth";
import { loadAdminOrganisationWorkflow, type AdminOrganisationWorkflow } from "./admin-organisations";
import { DataAccessError } from "./errors";
import { loadAdminSupportTickets, type SupportTicket } from "./support-tickets";

export type AdminSection = "overview" | "providers" | "workshops" | "customers" | "managers" | "sms" | "support" | "security";
type Status = "pending" | "active" | "suspended" | "rejected";

export type AdminDashboardData = {
  generatedAt: string;
  administrator: { displayName: string; email: string; role: "superadmin" | "admin" };
  counts: { providers: number; workshops: number; customers: number; managers: number; openBookings: number; smsAttention: number; openTickets: number };
  providers: Array<{ id: string; displayName: string; legalName: string; countryCode: string; status: Status; workshopCount: number; managerCount: number; createdAt: string }>;
  workshops: Array<{ id: string; displayName: string; providerName: string; city: string | null; countryCode: string; status: Status; acceptsBookings: boolean; openBookingCount: number; createdAt: string }>;
  customers: Array<{ id: string; fullName: string; phone: string | null; vehicleCount: number; bookingCount: number; createdAt: string }>;
  managers: Array<{ id: string; displayName: string; status: Status; providerNames: string[]; createdAt: string }>;
  sms: Array<{ kind: string; pending: number; sent: number; failed: number }>;
  supportTickets: SupportTicket[];
  workflow: AdminOrganisationWorkflow;
};

export async function loadAdminDashboard(administrator: AdministratorContext): Promise<AdminDashboardData> {
  const supabase = await createClient();
  const [{ data, error }, workflow, supportTickets] = await Promise.all([
    supabase.rpc("get_automotive_admin_snapshot"),
    loadAdminOrganisationWorkflow(),
    loadAdminSupportTickets(),
  ]);
  if (error || !data || typeof data !== "object") {
    throw new DataAccessError(error?.code === "42501" ? "unauthorized" : "unavailable");
  }
  const snapshot = data as unknown as Omit<AdminDashboardData, "administrator" | "workflow" | "supportTickets">;
  const activeProviderIds = new Set(workflow.providers.map((provider) => provider.id));
  const providers = snapshot.providers.filter((provider) => activeProviderIds.has(provider.id));
  return {
    ...snapshot,
    providers,
    counts: {
      ...snapshot.counts,
      providers: providers.length,
      openTickets: supportTickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length,
    },
    administrator: { displayName: administrator.displayName, email: administrator.email, role: administrator.role },
    supportTickets,
    workflow,
  };
}
