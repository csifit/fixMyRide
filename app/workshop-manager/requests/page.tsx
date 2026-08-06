import { redirect } from "next/navigation";
import { organizationLogoutAction } from "@/app/organization/actions";
import { getOrganizationAccess } from "@/lib/dal/organization";
import { loadManagedWorkshopBookings } from "@/lib/dal/workshop-bookings";
import WorkshopBookingInboxClient from "./WorkshopBookingInboxClient";

export const dynamic = "force-dynamic";

export default async function WorkshopBookingRequestsPage() {
  const access = await getOrganizationAccess("clinic_manager");
  if (access.state === "unauthenticated") redirect("/clinic-manager/login");
  if (access.state !== "active") redirect("/clinic-manager");
  const bookings = await loadManagedWorkshopBookings();
  return <WorkshopBookingInboxClient bookings={bookings} logoutAction={organizationLogoutAction} />;
}
