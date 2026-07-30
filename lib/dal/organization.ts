import "server-only";

import { isTemporarilyUnavailable } from "../auth-errors";
import { readSupabaseEnvironment } from "../env";
import { createClient } from "../supabase/server";

export type OrganizationPortalKind = "clinic_manager" | "staff";
export type OrganizationAccess =
  | { state: "configuration" | "unavailable" | "unauthenticated" | "unauthorized" }
  | { state: "pending" | "suspended" | "rejected" }
  | {
      state: "active";
      profile: { id: string; displayName: string };
    };

export type ManagerDashboard = {
  clinics: Array<{
    id: string;
    displayName: string;
    legalName: string;
    countryCode: string;
    status: string;
    membershipRole: string;
    doctors: Array<{ id: string; membershipId: string; name: string; status: string; specialty: string }>;
    billingStatus: string;
  }>;
};

export type StaffDashboard = {
  doctors: Array<{
    id: string;
    name: string;
    specialty: string;
    clinicName: string;
    status: string;
  }>;
};

export async function getOrganizationAccess(
  kind: OrganizationPortalKind,
): Promise<OrganizationAccess> {
  if (!readSupabaseEnvironment().configured) return { state: "configuration" };
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError && isTemporarilyUnavailable(claimsError)) {
    return { state: "unavailable" };
  }
  const authUserId = claimsError ? undefined : claimsData?.claims?.sub;
  if (!authUserId) return { state: "unauthenticated" };

  const table = kind === "clinic_manager"
    ? "clinic_manager_profiles"
    : "staff_profiles";
  const { data, error } = await supabase
    .from(table)
    .select("id, auth_user_id, display_name, status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) return { state: "unavailable" };
  if (!data || data.auth_user_id !== authUserId) return { state: "unauthorized" };
  if (data.status !== "active") {
    if (data.status === "pending" || data.status === "invited") {
      return { state: "pending" };
    }
    if (data.status === "suspended") return { state: "suspended" };
    return { state: "rejected" };
  }
  return {
    state: "active",
    profile: { id: data.id, displayName: data.display_name },
  };
}

export async function loadManagerDashboard(
  managerId: string,
): Promise<ManagerDashboard> {
  const supabase = await createClient();
  const { data: membershipData, error } = await supabase
    .from("clinic_manager_memberships")
    .select(
      "membership_role, status, clinics(id, display_name, legal_name, country_code, status)",
    )
    .eq("clinic_manager_id", managerId)
    .eq("status", "active");
  if (error) throw new Error("organization_unavailable");

  const memberships = (membershipData ?? []) as unknown as Array<{
    membership_role: string;
    clinics: {
      id: string;
      display_name: string;
      legal_name: string;
      country_code: string;
      status: string;
    } | null;
  }>;
  const clinicIds = memberships.flatMap((item) =>
    item.clinics ? [item.clinics.id] : []
  );
  if (!clinicIds.length) return { clinics: [] };

  const [{ data: doctorData, error: doctorError }, { data: billingData, error: billingError }] =
    await Promise.all([
      supabase
        .from("clinic_doctor_memberships")
        .select("id, clinic_id, status, clinicians(id, full_name, specialty)")
        .in("clinic_id", clinicIds),
      supabase
        .from("billing_profiles")
        .select("clinic_id, status")
        .in("clinic_id", clinicIds),
    ]);
  if (doctorError || billingError) throw new Error("organization_unavailable");
  const doctors = (doctorData ?? []) as unknown as Array<{
    id: string;
    clinic_id: string;
    status: string;
    clinicians: { id: string; full_name: string; specialty: string } | null;
  }>;
  const billing = (billingData ?? []) as Array<{
    clinic_id: string;
    status: string;
  }>;

  return {
    clinics: memberships.flatMap((membership) => {
      const clinic = membership.clinics;
      if (!clinic) return [];
      return [{
        id: clinic.id,
        displayName: clinic.display_name,
        legalName: clinic.legal_name,
        countryCode: clinic.country_code,
        status: clinic.status,
        membershipRole: membership.membership_role,
        billingStatus:
          billing.find((item) => item.clinic_id === clinic.id)?.status ??
          "incomplete",
        doctors: doctors
          .filter((item) => item.clinic_id === clinic.id && item.clinicians)
          .map((item) => ({
            id: item.clinicians!.id,
            membershipId: item.id,
            name: item.clinicians!.full_name,
            specialty: item.clinicians!.specialty,
            status: item.status,
          })),
      }];
    }),
  };
}

export async function loadStaffDashboard(
  staffId: string,
): Promise<StaffDashboard> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_doctor_assignments")
    .select(
      "status, clinicians(id, full_name, specialty, clinic_name)",
    )
    .eq("staff_id", staffId);
  if (error) throw new Error("organization_unavailable");
  const assignments = (data ?? []) as unknown as Array<{
    status: string;
    clinicians: {
      id: string;
      full_name: string;
      specialty: string;
      clinic_name: string;
    } | null;
  }>;
  return {
    doctors: assignments.flatMap((assignment) =>
      assignment.clinicians
        ? [{
            id: assignment.clinicians.id,
            name: assignment.clinicians.full_name,
            specialty: assignment.clinicians.specialty,
            clinicName: assignment.clinicians.clinic_name,
            status: assignment.status,
          }]
        : []
    ),
  };
}

export async function loadDoctorStaff(clinicianId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_doctor_assignments")
    .select("id, status, staff_profiles(id, display_name, status)")
    .eq("clinician_id", clinicianId);
  if (error) throw new Error("organization_unavailable");
  return (data ?? []) as unknown as Array<{
    id: string;
    status: string;
    staff_profiles: {
      id: string;
      display_name: string;
      status: string;
    } | null;
  }>;
}
