import { notFound, redirect } from "next/navigation";
import { getPublicWorkshop, loadPublicWorkshopBookingRules, loadPublicWorkshopServices } from "@/lib/dal/public-workshops";
import ServiceRequestFlow from "./ServiceRequestFlow";

export const dynamic = "force-dynamic";

export default async function ServiceRequestPage({ params, searchParams }: {
  params: Promise<{ workshopId: string }>;
  searchParams: Promise<{ service?: string; date?: string }>;
}) {
  const { workshopId } = await params;
  const query = await searchParams;
  const workshop = await getPublicWorkshop(workshopId);
  if (!workshop) notFound();
  if (workshopId !== workshop.slug) {
    const canonicalQuery = new URLSearchParams();
    if (query.service) canonicalQuery.set("service", query.service);
    if (query.date) canonicalQuery.set("date", query.date);
    redirect(`/workshops/${workshop.slug}/request${canonicalQuery.size ? `?${canonicalQuery}` : ""}`);
  }
  const [services, rules] = await Promise.all([
    loadPublicWorkshopServices(workshop.id),
    loadPublicWorkshopBookingRules(workshop.id),
  ]);
  if (!rules) notFound();
  const service = services.find((item) => item.id === query.service);
  if (!service) redirect(`/workshops/${workshop.slug}`);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query.date ?? "") ? query.date! : "";
  return <ServiceRequestFlow workshop={workshop} service={service} rules={rules} initialDate={date} />;
}
