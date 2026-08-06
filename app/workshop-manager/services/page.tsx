import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { getWorkshopManagerAccess } from "@/lib/dal/platform-access";
import { loadManagedWorkshopCatalogues } from "@/lib/dal/workshop-services";
import ServiceCatalogueClient from "./ServiceCatalogueClient";

export const dynamic = "force-dynamic";

export default async function WorkshopServiceCataloguePage() {
  const access = await getWorkshopManagerAccess();
  if (access.state === "unauthenticated") redirect("/workshop-manager/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const catalogues = await loadManagedWorkshopCatalogues();
  return <ServiceCatalogueClient catalogues={catalogues} logoutAction={platformLogoutAction} />;
}
