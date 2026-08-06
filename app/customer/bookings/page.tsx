import { redirect } from "next/navigation";
import { patientLogoutAction } from "@/app/patient/actions";
import { loadMyServiceBookings } from "@/lib/dal/customer-bookings";
import { getPatientAccess } from "@/lib/dal/patient-appointments";
import CustomerBookingsClient from "./CustomerBookingsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CustomerBookingsPage() {
  const access = await getPatientAccess();
  if (access.state === "unauthenticated") redirect("/patient/login");
  if (access.state !== "active") redirect("/patient/appointments");
  const bookings = await loadMyServiceBookings();
  return <CustomerBookingsClient bookings={bookings} logoutAction={patientLogoutAction} />;
}
