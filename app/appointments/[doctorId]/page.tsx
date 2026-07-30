import { notFound } from "next/navigation";
import { getPublicDoctor, loadPublicDoctorSlots, type PublicSlot } from "@/lib/dal/public-appointments";
import DoctorAvailabilityClient from "./DoctorAvailabilityClient";

export const dynamic = "force-dynamic";

function bucharestDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export default async function PublicDoctorPage({
  params,
  searchParams,
}: {
  params: Promise<{ doctorId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { doctorId } = await params;
  const query = await searchParams;
  const today = bucharestDate();
  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(query.date ?? "") ? query.date! : today;
  const selectedDate = requestedDate < today ? today : requestedDate;
  const doctor = await getPublicDoctor(doctorId);
  if (!doctor) notFound();
  let slots: PublicSlot[] = [];
  try {
    slots = await loadPublicDoctorSlots(doctorId, selectedDate);
  } catch {
    slots = [];
  }
  return <DoctorAvailabilityClient doctor={doctor} slots={slots} selectedDate={selectedDate} />;
}
