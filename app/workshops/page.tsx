import HomeDiscoveryClient from "@/app/HomeDiscoveryClient";
import { searchPublicWorkshops, type PublicWorkshop } from "@/lib/dal/public-workshops";

export const dynamic = "force-dynamic";

function todayInBucharest() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export default async function WorkshopsPage() {
  let workshops: PublicWorkshop[] = [];
  try {
    workshops = await searchPublicWorkshops("");
  } catch {
    workshops = [];
  }
  return <HomeDiscoveryClient workshops={workshops} date={todayInBucharest()} />;
}
