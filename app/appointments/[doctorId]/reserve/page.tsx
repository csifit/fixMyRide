import { notFound, redirect } from "next/navigation";
import { getPublicDoctor, loadPublicDoctorSlots } from "@/lib/dal/public-appointments";
import ReserveFlow from "./ReserveFlow";

export const dynamic = "force-dynamic";

function bucharestDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(value);
}

export default async function ReserveAppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ doctorId: string }>;
  searchParams: Promise<{ slot?: string; duration?: string }>;
}) {
  const { doctorId } = await params;
  const query = await searchParams;
  const scheduledStart = query.slot ?? "";
  const duration = Number(query.duration);
  if (!scheduledStart || ![15, 30, 45].includes(duration) || Number.isNaN(new Date(scheduledStart).getTime())) {
    redirect(`/appointments/${doctorId}`);
  }
  const doctor = await getPublicDoctor(doctorId);
  if (!doctor) notFound();
  const slots = await loadPublicDoctorSlots(doctorId, bucharestDate(new Date(scheduledStart)));
  const slot = slots.find((item) =>
    item.scheduledStart === scheduledStart && item.slotDurationMinutes === duration
  );
  if (!slot) redirect(`/appointments/${doctorId}`);
  return <ReserveFlow doctor={doctor} slot={slot} />;
}
