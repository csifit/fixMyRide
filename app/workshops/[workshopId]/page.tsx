import Link from "next/link";
import { notFound } from "next/navigation";
import PublicBookingHeader from "@/app/appointments/PublicBookingHeader";
import { getPublicWorkshop, loadPublicWorkshopServices } from "@/lib/dal/public-workshops";

export const dynamic = "force-dynamic";

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function price(service: { priceFromCents: number | null; currency: string }) {
  if (service.priceFromCents === null) return "Quote after review";
  return `From ${new Intl.NumberFormat("en", { style: "currency", currency: service.currency, maximumFractionDigits: 0 }).format(service.priceFromCents / 100)}`;
}

export default async function WorkshopPage({
  params,
  searchParams,
}: {
  params: Promise<{ workshopId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { workshopId } = await params;
  const { date } = await searchParams;
  const workshop = await getPublicWorkshop(workshopId);
  if (!workshop) notFound();
  const services = await loadPublicWorkshopServices(workshopId);
  return <main className="booking-shell doctor-public-page">
    <PublicBookingHeader />
    <section className="doctor-public-hero workshop-public-hero">
      <div className="doctor-public-avatar">{initials(workshop.name)}</div>
      <div>
        <span className="doctor-verified">✓ Verified service provider</span>
        <h1>{workshop.name}</h1>
        <strong>{workshop.serviceCategories.join(" · ") || "Vehicle servicing and repairs"}</strong>
        <p>{[workshop.address, workshop.city, workshop.countryCode].filter(Boolean).join(", ")}</p>
      </div>
      <aside><small>The workshop confirms every request</small><Link href="#service-list">Choose a service</Link></aside>
    </section>
    <section className="doctor-public-content workshop-public-content">
      <article>
        <h2>About this workshop</h2>
        <p>{workshop.description || "Service information will be added by the workshop."}</p>
        <div className="workshop-amenities">
          {workshop.offersPickup && <span>✓ Vehicle pickup available</span>}
          {workshop.offersCourtesyCar && <span>✓ Courtesy car available</span>}
          <span>✓ Email and SMS booking updates</span>
        </div>
      </article>
      <article>
        <h2>Contact</h2>
        <dl>
          <div><dt>Address</dt><dd>{[workshop.address, workshop.city, workshop.countryCode].filter(Boolean).join(", ")}</dd></div>
          {workshop.publicPhone && <div><dt>Phone</dt><dd><a href={`tel:${workshop.publicPhone}`}>{workshop.publicPhone}</a></dd></div>}
          {workshop.publicEmail && <div><dt>Email</dt><dd><a href={`mailto:${workshop.publicEmail}`}>{workshop.publicEmail}</a></dd></div>}
        </dl>
      </article>
    </section>
    <section className="workshop-services" id="service-list">
      <header><p>Request to book</p><h2>Choose the service your vehicle needs</h2><span>No payment is required. The workshop will review and confirm your requested time.</span></header>
      <div>{services.map((service) => <article key={service.id}>
        <span>{service.category}</span><h3>{service.name}</h3>
        <p>{service.description || "Discuss the exact work with the workshop after requesting."}</p>
        <div><b>{price(service)}</b>{service.estimatedDurationMinutes && <small>Estimated {service.estimatedDurationMinutes} min</small>}</div>
        <Link href={`/workshops/${workshop.id}/request?service=${service.id}&date=${encodeURIComponent(date ?? "")}`}>Request appointment</Link>
      </article>)}</div>
    </section>
  </main>;
}
