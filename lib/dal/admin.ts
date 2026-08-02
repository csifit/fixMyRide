import "server-only";

import { createClient } from "../supabase/server";
import type { AdministratorContext } from "./admin-auth";
import { DataAccessError } from "./errors";

export type AdminSection =
  | "attention"
  | "doctors"
  | "clinics"
  | "patients"
  | "organizations"
  | "managers"
  | "specialties"
  | "reviews"
  | "sms"
  | "contracts"
  | "privacy"
  | "security";

export type AdminDashboardData = {
  generatedAt: string;
  administrator: { displayName: string; role: "superadmin" | "admin" };
  counts: {
    attention: number;
    doctors: number;
    patients: number;
    clinics: number;
    clinicManagers: number;
    platformManagers: number;
  };
  tasks: Array<{
    id: string;
    kind: string;
    title: string;
    detail: string;
    status: string;
    priority: "high" | "normal";
    createdAt: string;
    href: string;
  }>;
  administrators: Array<{
    id: string;
    displayName: string;
    role: string;
    status: string;
    accountingAccess: boolean;
    createdAt: string;
  }>;
  clinicians: Array<{
    id: string;
    fullName: string;
    specialty: string;
    clinicName: string;
    status: string;
    professionalIdentifier: string;
    createdAt: string;
  }>;
  patients: Array<{
    id: string;
    vitapassId: string;
    fullName: string;
    archived: boolean;
    createdAt: string;
  }>;
  clinics: Array<{
    id: string;
    displayName: string;
    legalName: string;
    countryCode: string;
    status: string;
    city: string;
    address: string;
    managerCount: number;
    doctorCount: number;
    createdAt: string;
  }>;
  clinicManagers: Array<{
    id: string;
    displayName: string;
    status: string;
    clinicCount: number;
    createdAt: string;
  }>;
};

type JsonRecord = Record<string, unknown>;

const text = (row: JsonRecord, key: string) =>
  typeof row[key] === "string" ? (row[key] as string) : "";
const number = (row: JsonRecord, key: string) =>
  typeof row[key] === "number" ? (row[key] as number) : 0;
const records = (value: unknown) =>
  Array.isArray(value) ? (value.filter((item) => item && typeof item === "object") as JsonRecord[]) : [];

export async function loadAdminDashboard(
  administrator: AdministratorContext,
): Promise<AdminDashboardData> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_operations_snapshot");
  if (error || !data || typeof data !== "object") {
    throw new DataAccessError(error?.code === "42501" ? "unauthorized" : "unavailable");
  }

  const snapshot = data as JsonRecord;
  const counts = (snapshot.counts ?? {}) as JsonRecord;
  return {
    generatedAt: text(snapshot, "generated_at") || new Date().toISOString(),
    administrator: {
      displayName: administrator.displayName,
      role: administrator.role,
    },
    counts: {
      attention: number(counts, "attention"),
      doctors: number(counts, "doctors"),
      patients: number(counts, "patients"),
      clinics: number(counts, "clinics"),
      clinicManagers: number(counts, "clinic_managers"),
      platformManagers: number(counts, "platform_managers"),
    },
    tasks: records(snapshot.tasks).map((row) => ({
      id: text(row, "id"),
      kind: text(row, "kind"),
      title: text(row, "title"),
      detail: text(row, "detail"),
      status: text(row, "status"),
      priority: text(row, "priority") === "high" ? "high" : "normal",
      createdAt: text(row, "created_at"),
      href: text(row, "href") || "/admin",
    })),
    administrators: records(snapshot.administrators).map((row) => ({
      id: text(row, "id"),
      displayName: text(row, "display_name"),
      role: text(row, "role"),
      status: text(row, "status"),
      accountingAccess: row.accounting_access === true,
      createdAt: text(row, "created_at"),
    })),
    clinicians: records(snapshot.doctors).map((row) => ({
      id: text(row, "id"),
      fullName: text(row, "full_name"),
      specialty: text(row, "specialty"),
      clinicName: text(row, "clinic_name"),
      status: text(row, "verification_status"),
      professionalIdentifier: text(row, "professional_identifier"),
      createdAt: text(row, "created_at"),
    })),
    patients: records(snapshot.patients).map((row) => ({
      id: text(row, "id"),
      vitapassId: text(row, "vitapass_id"),
      fullName: text(row, "full_name"),
      archived: row.archived === true,
      createdAt: text(row, "created_at"),
    })),
    clinics: records(snapshot.clinics).map((row) => ({
      id: text(row, "id"),
      displayName: text(row, "display_name"),
      legalName: text(row, "legal_name"),
      countryCode: text(row, "country_code"),
      status: text(row, "status"),
      city: text(row, "city"),
      address: text(row, "address"),
      managerCount: number(row, "manager_count"),
      doctorCount: number(row, "doctor_count"),
      createdAt: text(row, "created_at"),
    })),
    clinicManagers: records(snapshot.clinic_managers).map((row) => ({
      id: text(row, "id"),
      displayName: text(row, "display_name"),
      status: text(row, "status"),
      clinicCount: number(row, "clinic_count"),
      createdAt: text(row, "created_at"),
    })),
  };
}
