import { redirect } from "next/navigation";
import { getOrganizationAccess } from "@/lib/dal/organization";
import { loadManagedClinicWorkspaces } from "@/lib/dal/workspaces";
import { organizationLogoutAction } from "@/app/organization/actions";
import ClinicSettingsClient from "./ClinicSettingsClient";

export const dynamic = "force-dynamic";

export default async function ClinicSettingsPage() {
  const access = await getOrganizationAccess("clinic_manager");
  if (access.state === "unauthenticated") redirect("/clinic-manager/login");
  if (access.state !== "active") redirect("/clinic-manager");
  const clinics = await loadManagedClinicWorkspaces(access.profile.id);
  return <ClinicSettingsClient clinics={clinics} logoutAction={organizationLogoutAction} />;
}
