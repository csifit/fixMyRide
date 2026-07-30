import { redirect } from "next/navigation";
import AppointmentManager from "@/app/appointments/AppointmentManager";
import { getDoctorAccess } from "@/lib/dal/auth";
import { loadAppointments, loadDoctorAvailability } from "@/lib/dal/appointments";
import { loadManagedAppointmentRequests } from "@/lib/dal/public-appointments";
import AccessStatusScreen from "../AccessStatusScreen";

export const dynamic = "force-dynamic";

export default async function DoctorAppointmentsPage() {
  const access = await getDoctorAccess();
  if (access.state === "unauthenticated") redirect("/doctor/login");
  if (access.state !== "approved") return <AccessStatusScreen status={access.state} />;
  let appointments;
  let availability;
  let requests;
  try {
    [appointments, availability, requests] = await Promise.all([
      loadAppointments([access.clinician.id]),
      loadDoctorAvailability([access.clinician.id]),
      loadManagedAppointmentRequests([access.clinician.id]),
    ]);
  } catch {
    return <AccessStatusScreen status="unavailable" />;
  }
  return <AppointmentManager
    kind="doctor"
    doctors={[{ id: access.clinician.id, name: access.clinician.fullName }]}
    appointments={appointments}
    availability={availability}
    requests={requests}
  />;
}
