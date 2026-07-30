import { redirect } from "next/navigation";
import AppointmentManager from "@/app/appointments/AppointmentManager";
import { loadAppointments, loadDoctorAvailability } from "@/lib/dal/appointments";
import { getOrganizationAccess, loadStaffDashboard } from "@/lib/dal/organization";
import { loadManagedAppointmentRequests } from "@/lib/dal/public-appointments";
import OrganizationAccessStatus from "@/app/organization/OrganizationAccessStatus";

export const dynamic = "force-dynamic";

export default async function StaffAppointmentsPage() {
  const access = await getOrganizationAccess("staff");
  if (access.state === "unauthenticated") redirect("/staff/login");
  if (access.state !== "active") return <OrganizationAccessStatus kind="staff" status={access.state} />;
  let doctors;
  let appointments;
  let availability;
  let requests;
  try {
    const dashboard = await loadStaffDashboard(access.profile.id);
    doctors = dashboard.doctors.filter((doctor) => doctor.status === "active");
    [appointments, availability, requests] = await Promise.all([
      loadAppointments(doctors.map(({ id }) => id)),
      loadDoctorAvailability(doctors.map(({ id }) => id)),
      loadManagedAppointmentRequests(doctors.map(({ id }) => id)),
    ]);
  } catch {
    return <OrganizationAccessStatus kind="staff" status="unavailable" />;
  }
  return <AppointmentManager
    kind="staff"
    doctors={doctors.map(({ id, name }) => ({ id, name }))}
    appointments={appointments}
    availability={availability}
    requests={requests}
  />;
}
