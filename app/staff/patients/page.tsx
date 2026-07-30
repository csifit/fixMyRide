import { redirect } from "next/navigation";
import { z } from "zod";
import OrganizationAccessStatus from "@/app/organization/OrganizationAccessStatus";
import { getOrganizationAccess, loadStaffDashboard } from "@/lib/dal/organization";
import { loadStaffMedicalProfile, loadStaffPatientList } from "@/lib/dal/staff-patients";
import StaffPatientsClient from "./StaffPatientsClient";

export const dynamic = "force-dynamic";

export default async function StaffPatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const access = await getOrganizationAccess("staff");
  if (access.state === "unauthenticated") redirect("/staff/login");
  if (access.state !== "active") return <OrganizationAccessStatus kind="staff" status={access.state} />;
  let patients;
  let selected;
  try {
    const dashboard = await loadStaffDashboard(access.profile.id);
    const clinicianIds = dashboard.doctors.filter((doctor) => doctor.status === "active").map((doctor) => doctor.id);
    patients = await loadStaffPatientList(clinicianIds);
    const patientId = z.uuid().safeParse((await searchParams).patient);
    selected = patientId.success && patients.some((patient) => patient.id === patientId.data)
      ? await loadStaffMedicalProfile(patientId.data)
      : null;
  } catch {
    return <OrganizationAccessStatus kind="staff" status="unavailable" />;
  }
  return <StaffPatientsClient patients={patients} selected={selected} />;
}
