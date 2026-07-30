import { redirect } from "next/navigation";
import { getOrganizationAccess } from "@/lib/dal/organization";
import OrganizationLoginForm from "../../organization/OrganizationLoginForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StaffLoginPage() {
  const access = await getOrganizationAccess("staff");
  if (!["configuration", "unauthenticated"].includes(access.state)) {
    redirect("/staff");
  }
  return <OrganizationLoginForm portal="staff" configured={access.state !== "configuration"} />;
}

