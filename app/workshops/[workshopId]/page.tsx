import Link from "next/link";
import { notFound } from "next/navigation";
import PublicSiteHeader from "@/app/PublicSiteHeader";
import { getPublicWorkshop, loadPublicWorkshopServices } from "@/lib/dal/public-workshops";
import { loadPublicWorkshopClaim } from "@/lib/dal/workshop-claims";
import { getWorkshopManagerAccess } from "@/lib/dal/platform-access";
import { loadManagedServiceProviders } from "@/lib/dal/service-providers";
import WorkshopClaimCard from "./WorkshopClaimCard";

export const dynamic = "force-dynamic";

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function price(service: { priceFromCents: number | null; currency: string }) {
  if (service.priceFromCents === null) return "Quote after review";
  return `From ${new Intl.NumberFormat("en", { style: "currency", currency: service.currency, maximumFractionDigits: 0 }).format(service.priceFromCents / 100)}`;
}

function diagnosisPrice(service: { diagnosisFeeCents: number | null; diagnosisCurrency: string | null }) {
  if (service.diagnosisFeeCents === null || !service.diagnosisCurrency) return null;
  return new Intl.NumberFormat("en", { style: "currency", currency: service.diagnosisCurrency }).format(service.diagnosisFeeCents / 100);
}

export default async function WorkshopPage({
  params,
  searchParams,
}: {
  params: Promise<{ workshopId: string }>;
  searchParams: Promise<{ date?: string; claim?: string }>;
}) {
  const { workshopId } = await params;
  const { date, claim: claimNotice } = await searchParams;
  const [workshop, publicClaim] = await Promise.all([
    getPublicWorkshop(workshopId),
    loadPublicWorkshopClaim(workshopId),
  ]);
  let ownerProviders: Array<{ id: string; displayName: string }> = [];
  if (publicClaim && !publicClaim.serviceProviderId) {
    const access = await getWorkshopManagerAccess();
    if (access.state === "active") {
      ownerProviders = (await loadManagedServiceProviders(access.manager.id))
        .filter((provider) => provider.membershipRole === "owner" && provider.status === "active")
        .map(({ id, displayName }) => ({ id, displayName }));
    }
  }
  if (!workshop) {
    if (!publicClaim) notFound();
    return <main className="booking-shell workshop-claim-page"><PublicSiteHeader /><WorkshopClaimCard claim={publicClaim} notice={claimNotice ?? null} ownerProviders={ownerProviders} /></main>;
  }
  const services = await loadPublicWorkshopServices(workshopId);
  return <main className="booking-shell workshop-public-page">
      <PublicSiteHeader />
    {publicClaim && publicClaim.status !== "claimed" && <WorkshopClaimCard claim={publicClaim} notice={claimNotice ?? null} compact ownerProviders={ownerProviders} />}
    <section className="workshop-public-hero">
      <div className="workshop-public-avatar">{initials(workshop.name)}</div>
      <div>
        <span className="workshop-verified">✓ Verified service provider</span>
        <h1>{workshop.name}</h1>
        <strong>{workshop.serviceCategories.join(" · ") || "Vehicle servicing and repairs"}</strong>
        <p>{[workshop.address, workshop.city, workshop.countryCode].filter(Boolean).join(", ")}</p>
      </div>
      {!publicClaim || publicClaim.status === "claimed" ? <aside><small>The workshop confirms every request</small><Link href="#service-list">Choose a service</Link></aside> : <aside><small>This workshop is listed by Pitster and is awaiting its service provider claim.</small></aside>}
    </section>
    <section className="workshop-public-content">
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
    {(!publicClaim || publicClaim.status === "claimed") && <section className="workshop-services" id="service-list">
      <header><p>Request to book</p><h2>Choose the service your vehicle needs</h2><span>Fault-based work starts with the workshop&apos;s disclosed diagnosis fee. Routine services can be booked directly.</span></header>
      <div>{services.map((service) => <article key={service.id}>
        <span>{service.category}</span><h3>{service.name}</h3>
        <p>{service.description || "Discuss the exact work with the workshop after requesting."}</p>
        {service.bookingMode === "diagnosis_first" && <p><strong>Diagnosis first: {diagnosisPrice(service)}</strong><br />This fee remains payable if you decline the later repair estimate.</p>}
        {service.bookingMode === "diagnosis" && <p><strong>Initial diagnostic assessment</strong><br />Further work requires a separate estimate and your approval.</p>}
        {service.bookingMode === "direct" && <p><strong>Direct service</strong><br />No separate diagnosis is required unless the workshop finds an additional fault.</p>}
        <div><b>{price(service)}</b>{service.estimatedDurationMinutes && <small>Estimated {service.estimatedDurationMinutes} min</small>}</div>
        <Link href={`/workshops/${workshop.id}/request?service=${service.id}&date=${encodeURIComponent(date ?? "")}`}>Request appointment</Link>
      </article>)}</div>
    </section>}
  </main>;
}
