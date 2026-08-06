import { notFound, redirect } from "next/navigation";
import { getPublicWorkshop, loadPublicWorkshopServices } from "@/lib/dal/public-workshops";
import ServiceRequestFlow from "./ServiceRequestFlow";

export const dynamic = "force-dynamic";

export default async function ServiceRequestPage({ params, searchParams }: {
  params: Promise<{ workshopId: string }>;
  searchParams: Promise<{ service?: string; date?: string }>;
}) {
  const { workshopId } = await params;
  const query = await searchParams;
  const [workshop, services] = await Promise.all([
    getPublicWorkshop(workshopId),
    loadPublicWorkshopServices(workshopId),
  ]);
  if (!workshop) notFound();
  const service = services.find((item) => item.id === query.service);
  if (!service) redirect(`/workshops/${workshopId}`);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query.date ?? "") ? query.date! : "";
  return <ServiceRequestFlow workshop={workshop} service={service} initialDate={date} />;
}
