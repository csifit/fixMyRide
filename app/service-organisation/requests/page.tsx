import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import WorkshopBookingInboxClient from "@/app/workshop-manager/requests/WorkshopBookingInboxClient";
import { getServiceOrganisationAccess } from "@/lib/dal/platform-access";
import { loadManagedWorkshopBookings } from "@/lib/dal/workshop-bookings";
import { loadMyWorkshopOperations } from "@/lib/dal/workshop-operations";
import { loadWorkshopScheduling } from "@/lib/dal/workshop-scheduling";
import { loadManagedWorkshopCatalogues } from "@/lib/dal/workshop-services";

export const dynamic = "force-dynamic";

export default async function ServiceOrganisationRequestsPage({ searchParams }: {
  searchParams: Promise<{ workshopId?: string }>;
}) {
  const access = await getServiceOrganisationAccess();
  if (access.state === "unauthenticated") redirect("/service-organisation/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const [bookings, catalogues, scheduling, operations] = await Promise.all([
    loadManagedWorkshopBookings(), loadManagedWorkshopCatalogues(),
    loadWorkshopScheduling(), loadMyWorkshopOperations(),
  ]);
  const { workshopId } = await searchParams;
  const selected = operations.find((location) => location.id === workshopId) ?? null;
  const selectedBookingIds = new Set(bookings
    .filter((booking) => booking.workshopId === selected?.id)
    .map((booking) => booking.id));
  return <WorkshopBookingInboxClient
    bookings={selected ? bookings.filter((booking) => booking.workshopId === selected.id) : []}
    catalogues={selected ? catalogues.filter((catalogue) => catalogue.workshopId === selected.id) : []}
    schedules={selected ? scheduling.schedules.filter((schedule) => schedule.workshopId === selected.id) : []}
    assignments={Object.fromEntries([...scheduling.assignments]
      .filter(([bookingId]) => selectedBookingIds.has(bookingId)))}
    operations={selected ? operations.filter((operation) => operation.id === selected.id) : []}
    locationSelection={{
      required: true,
      basePath: "/service-organisation/requests",
      selectedWorkshopId: selected?.id ?? null,
      locations: operations.map((location) => ({
        id: location.id,
        name: location.displayName,
        city: location.city,
      })),
    }}
    logoutAction={platformLogoutAction}
  />;
}
