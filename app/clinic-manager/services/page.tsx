import { redirect } from "next/navigation";
import { getOrganizationAccess } from "@/lib/dal/organization";
import { loadManagedWorkshopCatalogues } from "@/lib/dal/workshop-services";
import { organizationLogoutAction } from "@/app/organization/actions";
import ServiceCatalogueClient from "./ServiceCatalogueClient";

export const dynamic = "force-dynamic";

export default async function ServiceCataloguePage() {
  const access = await getOrganizationAccess("clinic_manager");
  if (access.state === "unauthenticated") redirect("/clinic-manager/login");
  if (access.state !== "active") redirect("/clinic-manager");
  const catalogues = await loadManagedWorkshopCatalogues();
  return <ServiceCatalogueClient catalogues={catalogues} logoutAction={organizationLogoutAction} />;
}
