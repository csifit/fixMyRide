import HomeDiscoveryClient from "./HomeDiscoveryClient";
import { searchPublicDoctors, type PublicDoctor } from "@/lib/dal/public-appointments";

export const dynamic = "force-dynamic";

function bucharestDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function Home() {
  let doctors: PublicDoctor[] = [];
  try {
    doctors = await searchPublicDoctors("");
  } catch {
    doctors = [];
  }
  return <HomeDiscoveryClient doctors={doctors} date={bucharestDate()} />;
}
