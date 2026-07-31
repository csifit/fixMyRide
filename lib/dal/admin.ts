import "server-only";

import { createClient } from "../supabase/server";
import type { AdministratorContext } from "./admin-auth";
import { DataAccessError } from "./errors";

export type AdminDashboardData = {
  generatedAt: string;
  administrator: { displayName: string };
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
  }>;
  patients: Array<{
    id: string;
    vitapassId: string;
    fullName: string;
    archived: boolean;
  }>;
  grants: Array<{
    id: string;
    patientId: string;
    clinicianId: string;
    status: string;
    canView: boolean;
    canEdit: boolean;
    expiresAt: string | null;
  }>;
  auditEvents: Array<{
    id: string;
    action: string;
    resourceType: string;
    occurredAt: string;
  }>;
};

export async function loadAdminDashboard(
  administrator: AdministratorContext,
): Promise<AdminDashboardData> {
  const supabase = await createClient();
  const [administrators, clinicians, patients, grants, auditEvents] =
    await Promise.all([
      supabase
        .from("application_administrators")
        .select("id, display_name, role, status, accounting_access, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("clinicians")
        .select("id, full_name, specialty, clinic_name, verification_status")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("patients")
        .select("id, vitapass_id, full_name, archived_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("patient_access_grants")
        .select("id, patient_id, clinician_id, status, can_view, can_edit, expires_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("audit_events")
        .select("id, action, resource_type, occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(100),
    ]);

  if (
    administrators.error ||
    clinicians.error ||
    patients.error ||
    grants.error ||
    auditEvents.error
  ) {
    throw new DataAccessError("unauthorized");
  }

  return {
    generatedAt: new Date().toISOString(),
    administrator: { displayName: administrator.displayName },
    administrators: (administrators.data ?? []).map((row) => ({
      id: row.id,
      displayName: row.display_name,
      role: row.role,
      status: row.status,
      accountingAccess: row.accounting_access,
      createdAt: row.created_at,
    })),
    clinicians: (clinicians.data ?? []).map((row) => ({
      id: row.id,
      fullName: row.full_name,
      specialty: row.specialty,
      clinicName: row.clinic_name,
      status: row.verification_status,
    })),
    patients: (patients.data ?? []).map((row) => ({
      id: row.id,
      vitapassId: row.vitapass_id,
      fullName: row.full_name,
      archived: Boolean(row.archived_at),
    })),
    grants: (grants.data ?? []).map((row) => ({
      id: row.id,
      patientId: row.patient_id,
      clinicianId: row.clinician_id,
      status: row.status,
      canView: row.can_view,
      canEdit: row.can_edit,
      expiresAt: row.expires_at,
    })),
    auditEvents: (auditEvents.data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      resourceType: row.resource_type,
      occurredAt: row.occurred_at,
    })),
  };
}
