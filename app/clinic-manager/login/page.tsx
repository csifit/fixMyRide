import { redirect } from "next/navigation";
import { getOrganizationAccess } from "@/lib/dal/organization";
import OrganizationLoginForm from "../../organization/OrganizationLoginForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ClinicManagerLoginPage() {
  const access = await getOrganizationAccess("clinic_manager");
  if (!["configuration", "unauthenticated"].includes(access.state)) {
    redirect("/clinic-manager");
  }
  return <OrganizationLoginForm portal="clinic_manager" configured={access.state !== "configuration"} />;
}

