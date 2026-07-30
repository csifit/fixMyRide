import { redirect } from "next/navigation";
import AppointmentManager from "@/app/appointments/AppointmentManager";
import { getDoctorAccess } from "@/lib/dal/auth";
import { loadAppointments } from "@/lib/dal/appointments";
import AccessStatusScreen from "../AccessStatusScreen";

export const dynamic = "force-dynamic";

export default async function DoctorAppointmentsPage() {
  const access = await getDoctorAccess();
  if (access.state === "unauthenticated") redirect("/doctor/login");
  if (access.state !== "approved") return <AccessStatusScreen status={access.state} />;
  let appointments;
  try {
    appointments = await loadAppointments([access.clinician.id]);
  } catch {
    return <AccessStatusScreen status="unavailable" />;
  }
  return <AppointmentManager
    kind="doctor"
    doctors={[{ id: access.clinician.id, name: access.clinician.fullName }]}
    appointments={appointments}
  />;
}
