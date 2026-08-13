import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import ServiceCatalogueClient from "@/app/workshop-manager/services/ServiceCatalogueClient";
import { getServiceOrganisationAccess } from "@/lib/dal/platform-access";
import { loadManagedWorkshopCatalogues } from "@/lib/dal/workshop-services";

export const dynamic = "force-dynamic";

export default async function ServiceOrganisationServicesPage() {
  const access = await getServiceOrganisationAccess();
  if (access.state === "unauthenticated") redirect("/service-organisation/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const catalogues = await loadManagedWorkshopCatalogues();
  return <ServiceCatalogueClient catalogues={catalogues} logoutAction={platformLogoutAction} />;
}
