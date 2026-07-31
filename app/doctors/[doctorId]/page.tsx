import { notFound } from "next/navigation";
import { getPublicDoctor } from "@/lib/dal/public-appointments";
import DoctorPublicProfile from "./DoctorPublicProfile";

export const dynamic = "force-dynamic";

function bucharestDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function DoctorProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ doctorId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { doctorId } = await params;
  const requestedDate = (await searchParams).date;
  const doctor = await getPublicDoctor(doctorId);
  if (!doctor) notFound();
  return <DoctorPublicProfile doctor={doctor} date={/^\d{4}-\d{2}-\d{2}$/.test(requestedDate ?? "") ? requestedDate! : bucharestDate()} />;
}
