import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { getWorkshopManagerAccess } from "@/lib/dal/platform-access";
import { loadManagedWorkshopBookings } from "@/lib/dal/workshop-bookings";
import { loadManagedWorkshopCatalogues } from "@/lib/dal/workshop-services";
import WorkshopBookingInboxClient from "./WorkshopBookingInboxClient";

export const dynamic = "force-dynamic";

export default async function WorkshopBookingRequestsPage() {
  const access = await getWorkshopManagerAccess();
  if (access.state === "unauthenticated") redirect("/workshop-manager/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const [bookings, catalogues] = await Promise.all([
    loadManagedWorkshopBookings(), loadManagedWorkshopCatalogues(),
  ]);
  return <WorkshopBookingInboxClient bookings={bookings} catalogues={catalogues} logoutAction={platformLogoutAction} />;
}
