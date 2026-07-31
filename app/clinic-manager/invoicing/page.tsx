import { redirect } from "next/navigation";
import { getOrganizationAccess, loadManagerDashboard } from "@/lib/dal/organization";
import { loadClinicBilling, loadClinicBillingUsage } from "@/lib/dal/invoicing";
import ClinicBillingOverviewClient from "./ClinicBillingOverviewClient";
import { organizationLogoutAction } from "../../organization/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ClinicInvoicingPage() {
  const access = await getOrganizationAccess("clinic_manager");
  if (access.state === "unauthenticated") redirect("/clinic-manager/login");
  if (access.state !== "active") redirect("/clinic-manager");
  const dashboard = await loadManagerDashboard(access.profile.id);
  const clinics = await Promise.all(dashboard.clinics.map(async (clinic) => ({
    id: clinic.id,
    name: clinic.displayName,
    profile: await loadClinicBilling(clinic.id),
    usage: await loadClinicBillingUsage(clinic.id),
  })));
  return <ClinicBillingOverviewClient clinics={clinics} logoutAction={organizationLogoutAction} />;
}
