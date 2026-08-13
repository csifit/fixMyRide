import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import WorkshopBookingInboxClient from "@/app/workshop-manager/requests/WorkshopBookingInboxClient";
import { getServiceOrganisationAccess } from "@/lib/dal/platform-access";
import { loadManagedWorkshopBookings } from "@/lib/dal/workshop-bookings";
import { loadMyWorkshopOperations } from "@/lib/dal/workshop-operations";
import { loadWorkshopScheduling } from "@/lib/dal/workshop-scheduling";
import { loadManagedWorkshopCatalogues } from "@/lib/dal/workshop-services";

export const dynamic = "force-dynamic";

export default async function ServiceOrganisationRequestsPage() {
  const access = await getServiceOrganisationAccess();
  if (access.state === "unauthenticated") redirect("/service-organisation/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const [bookings, catalogues, scheduling, operations] = await Promise.all([
    loadManagedWorkshopBookings(), loadManagedWorkshopCatalogues(),
    loadWorkshopScheduling(), loadMyWorkshopOperations(),
  ]);
  return <WorkshopBookingInboxClient bookings={bookings} catalogues={catalogues}
    schedules={scheduling.schedules} assignments={Object.fromEntries(scheduling.assignments)}
    operations={operations} logoutAction={platformLogoutAction} />;
}
