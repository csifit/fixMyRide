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
    email: string;
    fullName: string;
    specialty: string;
    clinicName: string;
    clinicCountry: string;
    status: string;
    professionalIdentifier: string;
    payerName: string;
    payerKind: "doctor" | "clinic";
    clinics: Array<{ id: string; name: string; status: string }>;
    freeAccess: Array<{ startsOn: string; endsBefore: string; months: number }>;
    statusHistory: Array<{
      previousStatus: string;
      newStatus: string;
      reason: string;
      changedAt: string;
    }>;
    createdAt: string;
  }>;
  doctorInvitations: Array<{
    id: string;
    email: string;
    status: string;
    freeAccessMonths: number;
    expiresAt: string;
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
    clinicId: string;
    organizationName: string;
    displayName: string;
    countryCode: string;
    status: string;
    description: string;
    publicPhone: string;
    publicEmail: string;
    city: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
    activeFrom: string;
    endsBefore: string;
    assignments: Array<{
      id: string;
      clinicianId: string;
      doctorName: string;
      status: string;
      startsOn: string;
      endsBefore: string;
    }>;
    statusHistory: Array<{
      previousStatus: string;
      newStatus: string;
      reason: string;
      changedAt: string;
    }>;
    createdAt: string;
  }>;
  clinicOrganizations: Array<{
    id: string;
    displayName: string;
    legalName: string;
    countryCode: string;
    status: string;
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
  const [operations, clinicOperations] = await Promise.all([
    supabase.rpc("get_admin_operations_snapshot"),
    supabase.rpc("get_admin_clinic_operations_snapshot"),
  ]);
  if (operations.error || clinicOperations.error || !operations.data || !clinicOperations.data || typeof operations.data !== "object" || typeof clinicOperations.data !== "object") {
    const code = operations.error?.code ?? clinicOperations.error?.code;
    throw new DataAccessError(code === "42501" ? "unauthorized" : "unavailable");
  }

  const snapshot = operations.data as JsonRecord;
  const clinicSnapshot = clinicOperations.data as JsonRecord;
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
      clinics: number(clinicSnapshot, "count"),
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
      email: text(row, "email"),
      fullName: text(row, "full_name"),
      specialty: text(row, "specialty"),
      clinicName: text(row, "clinic_name"),
      clinicCountry: text(row, "clinic_country"),
      status: text(row, "verification_status"),
      professionalIdentifier: text(row, "professional_identifier"),
      payerName: text(row, "payer_name"),
      payerKind: text(row, "payer_kind") === "clinic" ? "clinic" : "doctor",
      clinics: records(row.clinics).map((clinic) => ({
        id: text(clinic, "id"),
        name: text(clinic, "name"),
        status: text(clinic, "status"),
      })),
      freeAccess: records(row.free_access).map((period) => ({
        startsOn: text(period, "starts_on"),
        endsBefore: text(period, "ends_before"),
        months: number(period, "months"),
      })),
      statusHistory: records(row.status_history).map((history) => ({
        previousStatus: text(history, "previous_status"),
        newStatus: text(history, "new_status"),
        reason: text(history, "reason"),
        changedAt: text(history, "changed_at"),
      })),
      createdAt: text(row, "created_at"),
    })),
    doctorInvitations: records(snapshot.doctor_invitations).map((row) => ({
      id: text(row, "id"),
      email: text(row, "email"),
      status: text(row, "status"),
      freeAccessMonths: number(row, "free_access_months"),
      expiresAt: text(row, "expires_at"),
      createdAt: text(row, "created_at"),
    })),
    patients: records(snapshot.patients).map((row) => ({
      id: text(row, "id"),
      vitapassId: text(row, "vitapass_id"),
      fullName: text(row, "full_name"),
      archived: row.archived === true,
      createdAt: text(row, "created_at"),
    })),
    clinics: records(clinicSnapshot.locations).map((row) => ({
      id: text(row, "id"),
      clinicId: text(row, "clinic_id"),
      organizationName: text(row, "organization_name"),
      displayName: text(row, "display_name"),
      countryCode: text(row, "country_code"),
      status: text(row, "status"),
      description: text(row, "description"),
      publicPhone: text(row, "public_phone"),
      publicEmail: text(row, "public_email"),
      city: text(row, "city"),
      address: text(row, "address"),
      latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
      longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
      activeFrom: text(row, "active_from"),
      endsBefore: text(row, "ends_before"),
      assignments: records(row.assignments).map((assignment) => ({
        id: text(assignment, "id"),
        clinicianId: text(assignment, "clinician_id"),
        doctorName: text(assignment, "doctor_name"),
        status: text(assignment, "status"),
        startsOn: text(assignment, "starts_on"),
        endsBefore: text(assignment, "ends_before"),
      })),
      statusHistory: records(row.status_history).map((history) => ({
        previousStatus: text(history, "previous_status"),
        newStatus: text(history, "new_status"),
        reason: text(history, "reason"),
        changedAt: text(history, "changed_at"),
      })),
      createdAt: text(row, "created_at"),
    })),
    clinicOrganizations: records(clinicSnapshot.organizations).map((row) => ({
      id: text(row, "id"),
      displayName: text(row, "display_name"),
      legalName: text(row, "legal_name"),
      countryCode: text(row, "country_code"),
      status: text(row, "status"),
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
