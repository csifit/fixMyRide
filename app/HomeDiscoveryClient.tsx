"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import GoogleAddressSearch, { type GoogleAddressSelection } from "./GoogleAddressSearch";
import { type Language } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { brand } from "@/lib/brand";
import { distanceInKilometers } from "@/lib/geo";
import type { PublicWorkshop } from "@/lib/dal/public-workshops";

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatPrice(cents: number | null) {
  if (cents === null) return "Price confirmed by workshop";
  return `From €${(cents / 100).toFixed(0)}`;
}

export default function HomeDiscoveryClient({
  workshops,
  date,
}: {
  workshops: PublicWorkshop[];
  date: string;
}) {
  const [language, setLanguage] = useLanguage();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [locationText, setLocationText] = useState("");
  const [locationSelection, setLocationSelection] = useState<GoogleAddressSelection | null>(null);
  const [preferredDate, setPreferredDate] = useState(date);
  const categories = useMemo(
    () => [...new Set(workshops.flatMap((workshop) => workshop.serviceCategories))].sort(),
    [workshops],
  );
  const filtered = workshops.filter((workshop) => {
    const haystack = `${workshop.name} ${workshop.description ?? ""} ${workshop.city ?? ""} ${workshop.address ?? ""} ${workshop.serviceCategories.join(" ")}`.toLocaleLowerCase(language);
    const locationMatches = locationSelection?.latitude != null && locationSelection.longitude != null
      ? workshop.latitude != null && workshop.longitude != null
        && distanceInKilometers(
          { latitude: locationSelection.latitude, longitude: locationSelection.longitude },
          { latitude: workshop.latitude, longitude: workshop.longitude },
        ) <= 50
      : !locationText.trim() || haystack.includes(locationText.trim().toLocaleLowerCase(language));
    return (!query.trim() || haystack.includes(query.trim().toLocaleLowerCase(language)))
      && (!category || workshop.serviceCategories.includes(category))
      && locationMatches;
  });

  return <main className="home-shell">
    <header className="home-header">
      <Link href="/" className="home-logo"><span>{brand.mark}</span>{brand.name}</Link>
      <nav>
        <Link href="/workshops">Find a workshop</Link>
        <a href="#services">Services</a>
        <Link href="/garage">My Garage</Link>
        <Link href="/clinic-manager/login">For service providers</Link>
      </nav>
      <select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label="Language">
        <option value="en">EN</option><option value="de">DE</option>
        <option value="ro">RO</option><option value="hu">HU</option>
      </select>
    </header>

    <section className="home-discovery automotive-hero">
      <div className="automotive-hero-copy">
        <p>Car care, without the guesswork</p>
        <h1>Find a trusted workshop and request your service online</h1>
        <span>Compare nearby providers, tell them what your car needs, and receive confirmation by email and SMS.</span>
        <div className="automotive-trust-row">
          <span>✓ Request for free</span>
          <span>✓ Workshop confirmation</span>
          <span>✓ No card required</span>
        </div>
      </div>
      <div className="home-search-panel">
        <div><p>Start your booking</p><h2>What does your car need?</h2></div>
        <form className="home-filter-form" onSubmit={(event) => event.preventDefault()}>
          <label><span>Workshop or service</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Diagnostics, tyres, brakes…" />
          </label>
          <div>
            <label><span>Service</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">All services</option>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <GoogleAddressSearch label="Location" placeholder="Search an address or city" help="Choose an address to find workshops within 50 km." unavailable="Address search is unavailable. Type a city or address." language={language} formFields={false} onSelection={setLocationSelection} onTextChange={setLocationText} />
          </div>
          <label><span>Preferred arrival date</span>
            <input type="date" value={preferredDate} min={date} onChange={(event) => setPreferredDate(event.target.value)} />
          </label>
          <div className="home-search-summary"><strong>{filtered.length}</strong><span>matching workshops</span></div>
          <a className="home-results-button" href="#featured-workshops">Show workshops</a>
        </form>
        <small className="home-trust-note">✓ Your request is only booked after the workshop confirms it</small>
      </div>
    </section>

    <section className="home-featured" id="featured-workshops">
      <header>
        <div><p>Local service providers</p><h2>Workshops accepting booking requests</h2></div>
        <Link href={`/workshops?date=${preferredDate}`}>View all workshops →</Link>
      </header>
      <div className="home-doctor-grid">
        {filtered.slice(0, 6).map((workshop) => <article className="home-doctor-card" key={workshop.id}>
          <div className="home-doctor-avatar">{initials(workshop.name)}</div>
          <span className="home-verified">✓ Verified service provider</span>
          <h3>{workshop.name}</h3>
          <strong>{workshop.serviceCategories.slice(0, 2).join(" · ") || "General repairs"}</strong>
          <p>{workshop.city || workshop.countryCode}<br />{workshop.address}</p>
          <div className="doctor-features">
            {workshop.offersPickup && <span>✓ Vehicle pickup</span>}
            {workshop.offersCourtesyCar && <span>✓ Courtesy car</span>}
          </div>
          <b>{formatPrice(workshop.priceFromCents)}</b>
          <Link href={`/workshops/${workshop.id}?date=${preferredDate}`}>View workshop</Link>
        </article>)}
        {!filtered.length && <div className="booking-empty"><h3>No workshops found</h3><p>Try another service or location. New providers will appear here after the automotive database migration is applied.</p></div>}
      </div>
    </section>

    <section className="home-specialty-strip" id="services">
      <p>Browse by service</p><h2>Book the care your vehicle needs</h2>
      <div>{categories.map((item) => <button type="button" key={item} onClick={() => { setCategory(item); document.getElementById("featured-workshops")?.scrollIntoView({ behavior: "smooth" }); }}>{item}</button>)}</div>
    </section>

    <section className="provider-offer">
      <div><p>For workshops</p><h2>Receive and manage customer booking requests</h2><span>One simple plan with the booking workspace and customer SMS notifications included.</span></div>
      <div><strong>€35</strong><span>per month</span><b>SMS included</b><Link href="/register/clinic-manager">Join as a service provider</Link></div>
    </section>

    <footer className="home-footer" id="legal">
      <div><strong>Customers</strong><Link href="/workshops">Find a workshop</Link><Link href="/garage">My Garage</Link><Link href="/patient/login">Sign in</Link></div>
      <div><strong>Service providers</strong><Link href="/register/clinic-manager">Join the platform</Link><Link href="/clinic-manager/login">Provider sign in</Link><span>€35/month · SMS included</span></div>
      <div><strong>Legal</strong><a href="#legal">Terms and conditions</a><a href="#legal">Privacy policy</a><a href="#legal">Cookie policy</a></div>
      <div><strong>Contact</strong><a href={`mailto:${brand.supportEmail}`}>Support</a><a href={`mailto:${brand.supportEmail}?subject=${encodeURIComponent(`${brand.name} problem report`)}`}>Report a problem</a></div>
      <p>© {new Date().getFullYear()} {brand.name}</p>
    </footer>
  </main>;
}
