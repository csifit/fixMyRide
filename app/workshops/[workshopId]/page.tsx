import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import PublicSiteHeader from "@/app/PublicSiteHeader";
import { getPublicWorkshop, loadPublicWorkshopServices } from "@/lib/dal/public-workshops";
import { loadPublicWorkshopClaim } from "@/lib/dal/workshop-claims";
import { getWorkshopManagerAccess } from "@/lib/dal/platform-access";
import { loadManagedServiceProviders } from "@/lib/dal/service-providers";
import WorkshopClaimCard from "./WorkshopClaimCard";
import WorkshopLocationMap from "./WorkshopLocationMap";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: {
  params: Promise<{ workshopId: string }>;
}): Promise<Metadata> {
  const { workshopId } = await params;
  const workshop = await getPublicWorkshop(workshopId);
  if (!workshop) return {};
  return {
    title: `${workshop.name} | pitster`,
    description: workshop.description
      ?? `View services and request an appointment with ${workshop.name}.`,
    alternates: { canonical: `/workshops/${workshop.slug}` },
  };
}

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

export default async function WorkshopPage({ params, searchParams }: {
  params: Promise<{ workshopId: string }>;
  searchParams: Promise<{ date?: string; claim?: string }>;
}) {
  const { workshopId } = await params;
  const { date, claim: claimNotice } = await searchParams;
  const workshop = await getPublicWorkshop(workshopId);
  const publicClaim = workshop
    ? await loadPublicWorkshopClaim(workshop.id)
    : /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workshopId)
      ? await loadPublicWorkshopClaim(workshopId)
      : null;
  if (workshop && workshopId !== workshop.slug) {
    const query = new URLSearchParams();
    if (date) query.set("date", date);
    if (claimNotice) query.set("claim", claimNotice);
    redirect(`/workshops/${workshop.slug}${query.size ? `?${query}` : ""}`);
  }
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

  const services = await loadPublicWorkshopServices(workshop.id);
  const bookingAvailable = !publicClaim || publicClaim.status === "claimed";
  const recommendedService = services.find((service) => service.bookingMode === "diagnosis")
    ?? services.find((service) => service.bookingMode === "diagnosis_first")
    ?? services[0];
  const orderedServices = recommendedService
    ? [recommendedService, ...services.filter((service) => service.id !== recommendedService.id)]
    : [];
  const address = [workshop.address, workshop.city, workshop.countryCode]
    .filter(Boolean).join(", ");

  return <main className="booking-shell workshop-public-page">
    <PublicSiteHeader />
    <section className="workshop-public-hero">
      <div className="workshop-public-avatar">{initials(workshop.name)}</div>
      <div>
        <span className={bookingAvailable ? "workshop-verified" : "workshop-listing-pending"}>{bookingAvailable ? "✓ Verified service provider" : "Pitster listing · awaiting claim"}</span>
        <h1>{workshop.name}</h1>
        <strong>{workshop.serviceCategories.join(" · ") || "Vehicle servicing and repairs"}</strong>
        <p>{address}</p>
      </div>
    </section>
    <section className="workshop-profile-layout">
      <div className="workshop-profile-main">
        {bookingAvailable && recommendedService && <article className="workshop-appointment-card" id="appointment">
          <header><p>Request an appointment</p><h2>What does your vehicle need?</h2><span>Choose a service and preferred date. The workshop confirms the final appointment.</span></header>
          <form action={`/workshops/${workshop.slug}/request`} method="get">
            <label>Service<select name="service" defaultValue={recommendedService.id} required>{orderedServices.map((service, index) => <option key={service.id} value={service.id}>{index === 0 ? "Recommended · " : ""}{service.name} · {price(service)}</option>)}</select></label>
            <label>Preferred date<input name="date" type="date" defaultValue={date ?? ""} required /></label>
            <button>Check appointment</button>
          </form>
          <div className="workshop-diagnosis-recommendation"><strong>Recommended first step: {recommendedService.name}</strong><span>{recommendedService.bookingMode === "direct" ? "This workshop has not published a separate diagnosis service yet." : `Diagnosis first: the vehicle is assessed${diagnosisPrice(recommendedService) ? ` for ${diagnosisPrice(recommendedService)}` : ""}, before you approve any further repair.`}</span></div>
        </article>}
        <article className="workshop-about-card">
          <h2>About the shop</h2>
          <p>{workshop.description || "Service information will be added by the workshop."}</p>
          <div className="workshop-amenities">
            {workshop.offersPickup && <span>✓ Vehicle pickup available</span>}
            {workshop.offersCourtesyCar && <span>✓ Courtesy car available</span>}
            {bookingAvailable && <span>✓ Email and SMS booking updates</span>}
          </div>
          <section className="workshop-offered-services">
            <header><h3>Services offered</h3><span>{services.length} published</span></header>
            {services.length ? <ul>{services.map((service) => <li key={service.id}><span><strong>{service.name}</strong><small>{service.category} · {service.bookingMode === "direct" ? "Direct service" : "Diagnosis first"}</small></span><b>{price(service)}</b></li>)}</ul> : <p>No services have been published yet.</p>}
          </section>
        </article>
        <article className="workshop-contact-card">
          <h2>Contact</h2>
          <dl>
            <div><dt>Address</dt><dd>{address}</dd></div>
            {workshop.publicPhone && <div><dt>Phone</dt><dd><a href={`tel:${workshop.publicPhone}`}>{workshop.publicPhone}</a></dd></div>}
            {workshop.publicEmail && <div><dt>Email</dt><dd><a href={`mailto:${workshop.publicEmail}`}>{workshop.publicEmail}</a></dd></div>}
          </dl>
        </article>
      </div>
      <aside className="workshop-profile-sidebar">
        {workshop.latitude !== null && workshop.longitude !== null && <WorkshopLocationMap name={workshop.name} address={address} latitude={workshop.latitude} longitude={workshop.longitude} />}
        {publicClaim && publicClaim.status !== "claimed" && <WorkshopClaimCard claim={publicClaim} notice={claimNotice ?? null} compact ownerProviders={ownerProviders} />}
      </aside>
    </section>
  </main>;
}
