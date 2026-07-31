import DoctorSearchClient from "./DoctorSearchClient";
import { searchPublicDoctors, type PublicDoctor } from "@/lib/dal/public-appointments";

export const dynamic = "force-dynamic";

function bucharestDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export default async function PublicAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; date?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim().slice(0, 120) ?? "";
  const today = bucharestDate();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : today;
  let doctors: PublicDoctor[] = [];
  try {
    doctors = await searchPublicDoctors("");
  } catch {
    doctors = [];
  }
  return <DoctorSearchClient doctors={doctors} query={query} date={date < today ? today : date} />;
}
