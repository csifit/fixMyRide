import "server-only";

import { createClient } from "../supabase/server";
import type { AdministratorContext } from "./admin-auth";
import { DataAccessError } from "./errors";

export type AdminSection = "overview" | "providers" | "workshops" | "customers" | "managers" | "sms" | "security";
type Status = "pending" | "active" | "suspended" | "rejected";

export type AdminDashboardData = {
  generatedAt: string;
  administrator: { displayName: string; role: "superadmin" | "admin" };
  counts: { providers: number; workshops: number; customers: number; managers: number; openBookings: number; smsAttention: number };
  providers: Array<{ id: string; displayName: string; legalName: string; countryCode: string; status: Status; workshopCount: number; managerCount: number; createdAt: string }>;
  workshops: Array<{ id: string; displayName: string; providerName: string; city: string | null; countryCode: string; status: Status; acceptsBookings: boolean; openBookingCount: number; createdAt: string }>;
  customers: Array<{ id: string; fullName: string; phone: string | null; vehicleCount: number; bookingCount: number; createdAt: string }>;
  managers: Array<{ id: string; displayName: string; status: Status; providerNames: string[]; createdAt: string }>;
  sms: Array<{ kind: string; pending: number; sent: number; failed: number }>;
};

export async function loadAdminDashboard(administrator: AdministratorContext): Promise<AdminDashboardData> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_automotive_admin_snapshot");
  if (error || !data || typeof data !== "object") {
    throw new DataAccessError(error?.code === "42501" ? "unauthorized" : "unavailable");
  }
  return {
    ...(data as unknown as Omit<AdminDashboardData, "administrator">),
    administrator: { displayName: administrator.displayName, role: administrator.role },
  };
}
