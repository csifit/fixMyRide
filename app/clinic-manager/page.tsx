import { redirect } from "next/navigation";
import {
  getOrganizationAccess,
  loadManagerDashboard,
} from "@/lib/dal/organization";
import OrganizationPortalClient from "../organization/OrganizationPortalClient";
import OrganizationAccessStatus from "../organization/OrganizationAccessStatus";
import { organizationLogoutAction } from "../organization/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ClinicManagerPage() {
  const access = await getOrganizationAccess("clinic_manager");
  if (access.state === "unauthenticated") redirect("/clinic-manager/login");
  if (access.state !== "active") {
    return <OrganizationAccessStatus kind="clinic_manager" status={access.state} />;
  }
  let dashboard;
  try {
    dashboard = await loadManagerDashboard(access.profile.id);
  } catch {
    return <OrganizationAccessStatus kind="clinic_manager" status="unavailable" />;
  }
  return <OrganizationPortalClient kind="clinic_manager" displayName={access.profile.displayName} dashboard={dashboard} logoutAction={organizationLogoutAction} />;
}
