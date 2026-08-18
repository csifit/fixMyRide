import HomeDiscoveryClient from "@/app/HomeDiscoveryClient";
import { searchPublicWorkshops, type PublicWorkshop } from "@/lib/dal/public-workshops";
import { standardServiceTemplates } from "@/lib/automotive-service-catalogue";

export const dynamic = "force-dynamic";

function todayInBucharest() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export default async function WorkshopsPage({ searchParams }: PageProps<"/workshops">) {
  const serviceParam = (await searchParams).service;
  const requestedServiceCode = typeof serviceParam === "string"
    && standardServiceTemplates.some((service) => service.code !== "diagnosis" && service.code === serviceParam)
    ? serviceParam
    : undefined;
  let workshops: PublicWorkshop[] = [];
  try {
    workshops = await searchPublicWorkshops("", requestedServiceCode);
  } catch {
    workshops = [];
  }
  return <HomeDiscoveryClient workshops={workshops} date={todayInBucharest()} selectedServiceCode={requestedServiceCode} />;
}
