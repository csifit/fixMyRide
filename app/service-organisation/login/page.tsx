import { redirect } from "next/navigation";
import PlatformLoginForm from "@/app/authentication/PlatformLoginForm";
import { getServiceOrganisationAccess } from "@/lib/dal/platform-access";

export const dynamic = "force-dynamic";

export default async function ServiceOrganisationLoginPage() {
  const access = await getServiceOrganisationAccess();
  if (access.state === "active") redirect("/service-organisation");
  if (!['configuration', 'unauthenticated', 'unauthorized'].includes(access.state)) {
    redirect("/workshop-manager");
  }
  return <PlatformLoginForm portal="service_organisation" configured={access.state !== "configuration"} />;
}
