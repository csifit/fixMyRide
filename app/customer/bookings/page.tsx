import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { loadMyServiceBookings } from "@/lib/dal/customer-bookings";
import { getCustomerAccess } from "@/lib/dal/platform-access";
import CustomerBookingsClient from "./CustomerBookingsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CustomerBookingsPage() {
  const access = await getCustomerAccess();
  if (access.state === "unauthenticated") redirect("/customer/login");
  if (access.state !== "active") redirect("/customer/login");
  const bookings = await loadMyServiceBookings();
  return <CustomerBookingsClient bookings={bookings} logoutAction={platformLogoutAction} />;
}
