import { redirect } from "next/navigation";
import { loadPublicDoctorSlots } from "@/lib/dal/public-appointments";
import {
  getPatientAccess,
  loadMyPatientAppointments,
  type PatientAppointment,
} from "@/lib/dal/patient-appointments";
import PatientAppointmentCenter from "./PatientAppointmentCenter";

export const dynamic = "force-dynamic";

export default async function PatientAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string; date?: string }>;
}) {
  const access = await getPatientAccess();
  if (access.state === "unauthenticated") redirect("/patient/login");
  if (access.state !== "active") {
    return <PatientAppointmentCenter
      patientName=""
      appointments={[]}
      selectedId={null}
      selectedDate=""
      currentDate=""
      slots={[]}
      unavailable
    />;
  }
  const { booking = "", date = "" } = await searchParams;
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Bucharest",
  }).format(new Date());
  let appointments: PatientAppointment[] = [];
  let selectedId: string | null = null;
  let selectedDate = today;
  let slots: Awaited<ReturnType<typeof loadPublicDoctorSlots>> = [];
  let unavailable = false;
  try {
    appointments = await loadMyPatientAppointments();
    const selected = appointments.find((item) => item.id === booking)
      ?? appointments.find((item) =>
        ["pending", "confirmed"].includes(item.status)
        && item.scheduledStart.slice(0, 10) >= today
      )
      ?? appointments[0]
      ?? null;
    selectedId = selected?.id ?? null;
    selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
    slots = selected?.status === "confirmed"
      && selected.publicRequestId
      && selected.changeRequest?.status !== "pending"
      ? await loadPublicDoctorSlots(selected.clinicianId, selectedDate)
      : [];
  } catch {
    unavailable = true;
  }
  return <PatientAppointmentCenter
    patientName={access.patient.fullName}
    appointments={appointments}
    selectedId={selectedId}
    selectedDate={selectedDate}
    currentDate={today}
    slots={slots}
    unavailable={unavailable}
  />;
}
