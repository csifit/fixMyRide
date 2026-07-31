import { redirect } from "next/navigation";
import { getDoctorAccess } from "@/lib/dal/auth";
import { loadDoctorBilling } from "@/lib/dal/invoicing";
import { loadDoctorWorkspace } from "@/lib/dal/workspaces";
import InvoicingDetailsClient from "../../organization/InvoicingDetailsClient";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DoctorInvoicingPage() {
  const access = await getDoctorAccess();
  if (access.state === "unauthenticated") redirect("/doctor/login");
  if (access.state !== "approved") redirect("/doctor");
  const workspace = await loadDoctorWorkspace();
  if (!workspace?.canEditBilling) redirect("/doctor/settings");
  const profile = await loadDoctorBilling(access.clinician.id);
  return <InvoicingDetailsClient profile={profile} clinicId={null} backHref="/doctor" logoutAction={logoutAction} />;
}
