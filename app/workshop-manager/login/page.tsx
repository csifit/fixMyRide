import { redirect } from "next/navigation";
import PlatformLoginForm from "@/app/authentication/PlatformLoginForm";
import { getServiceOrganisationAccess, getWorkshopManagerAccess } from "@/lib/dal/platform-access";

export const dynamic = "force-dynamic";

export default async function WorkshopManagerLoginPage() {
  const access = await getWorkshopManagerAccess();
  if (access.state === "active") {
    const organisationAccess = await getServiceOrganisationAccess();
    redirect(organisationAccess.state === "active" ? "/service-organisation" : "/workshop-manager");
  }
  if (!["configuration", "unauthenticated"].includes(access.state)) redirect("/workshop-manager");
  return <PlatformLoginForm portal="workshop_manager" configured={access.state !== "configuration"} />;
}
