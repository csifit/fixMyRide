import { redirect } from "next/navigation";
import {
  getOrganizationAccess,
  loadStaffDashboard,
} from "@/lib/dal/organization";
import OrganizationPortalClient from "../organization/OrganizationPortalClient";
import OrganizationAccessStatus from "../organization/OrganizationAccessStatus";
import { organizationLogoutAction } from "../organization/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StaffPage() {
  const access = await getOrganizationAccess("staff");
  if (access.state === "unauthenticated") redirect("/staff/login");
  if (access.state !== "active") {
    return <OrganizationAccessStatus kind="staff" status={access.state} />;
  }
  let dashboard;
  try {
    dashboard = await loadStaffDashboard(access.profile.id);
  } catch {
    return <OrganizationAccessStatus kind="staff" status="unavailable" />;
  }
  return <OrganizationPortalClient kind="staff" displayName={access.profile.displayName} dashboard={dashboard} logoutAction={organizationLogoutAction} />;
}
