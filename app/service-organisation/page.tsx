import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { getServiceOrganisationAccess } from "@/lib/dal/platform-access";
import { loadManagedServiceProviders } from "@/lib/dal/service-providers";
import ServiceOrganisationDashboard from "./ServiceOrganisationDashboard";

export const dynamic = "force-dynamic";

export default async function ServiceOrganisationPage() {
  const access = await getServiceOrganisationAccess();
  if (access.state === "unauthenticated") redirect("/service-organisation/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const providers = (await loadManagedServiceProviders(access.manager.id))
    .filter((provider) => provider.membershipRole === "owner");
  return <ServiceOrganisationDashboard
    displayName={access.manager.displayName}
    providers={providers}
    logoutAction={platformLogoutAction}
  />;
}
