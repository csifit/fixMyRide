import { redirect } from "next/navigation";
import { getOrganizationAccess, loadManagerDashboard } from "@/lib/dal/organization";
import { loadClinicBilling } from "@/lib/dal/invoicing";
import InvoicingDetailsClient from "../../organization/InvoicingDetailsClient";
import { organizationLogoutAction } from "../../organization/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ClinicInvoicingPage() {
  const access = await getOrganizationAccess("clinic_manager");
  if (access.state === "unauthenticated") redirect("/clinic-manager/login");
  if (access.state !== "active") redirect("/clinic-manager");
  const dashboard = await loadManagerDashboard(access.profile.id);
  const clinic = dashboard.clinics[0];
  if (!clinic) redirect("/clinic-manager");
  const profile = await loadClinicBilling(clinic.id);
  return <InvoicingDetailsClient profile={profile} clinicId={clinic.id} backHref="/clinic-manager" logoutAction={organizationLogoutAction} />;
}
