"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import GoogleAddressSearch, { type GoogleAddressSelection } from "./GoogleAddressSearch";
import PublicWorkshopMap from "./PublicWorkshopMap";
import { translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { brand } from "@/lib/brand";
import { distanceInKilometers } from "@/lib/geo";
import type { PublicWorkshop } from "@/lib/dal/public-workshops";

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export default function HomeDiscoveryClient({
  workshops,
  date,
}: {
  workshops: PublicWorkshop[];
  date: string;
}) {
  const [language, setLanguage] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  const formatPrice = (cents: number | null) => cents === null
    ? t("home.priceConfirmed")
    : `${t("home.from")} €${(cents / 100).toFixed(0)}`;
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
        <Link href="/workshops">{t("home.nav.findWorkshop")}</Link>
        <a href="#services">{t("home.nav.services")}</a>
        <Link href="/garage">{t("home.nav.garage")}</Link>
        <Link href="/service-organisation/login">{t("home.nav.providers")}</Link>
      </nav>
      <select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label="Language">
        <option value="en">EN</option><option value="de">DE</option>
        <option value="ro">RO</option><option value="hu">HU</option>
      </select>
    </header>

    <section className="home-discovery automotive-hero">
      <div className="automotive-hero-copy">
        <p>{t("home.hero.kicker")}</p>
        <h1>{t("home.hero.title")}</h1>
        <span>{t("home.hero.description")}</span>
        <div className="automotive-trust-row">
          <span>✓ {t("home.hero.free")}</span>
          <span>✓ {t("home.hero.confirmation")}</span>
          <span>✓ {t("home.hero.noCard")}</span>
        </div>
      </div>
      <div className="home-search-panel">
        <div><p>{t("home.search.kicker")}</p><h2>{t("home.search.title")}</h2></div>
        <form className="home-filter-form" onSubmit={(event) => event.preventDefault()}>
          <label><span>{t("home.search.workshopOrService")}</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("home.search.workshopPlaceholder")} />
          </label>
          <div>
            <label><span>{t("home.search.service")}</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">{t("home.search.allServices")}</option>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <GoogleAddressSearch label={t("home.search.location")} placeholder={t("home.search.locationPlaceholder")} help={t("home.search.locationHelp")} unavailable={t("home.search.locationUnavailable")} language={language} formFields={false} onSelection={setLocationSelection} onTextChange={setLocationText} />
          </div>
          <label><span>{t("home.search.date")}</span>
            <input type="date" value={preferredDate} min={date} onChange={(event) => setPreferredDate(event.target.value)} />
          </label>
          <div className="home-search-summary"><strong>{filtered.length}</strong><span>{t("home.search.matches")}</span></div>
          <a className="home-results-button" href="#featured-workshops">{t("home.search.show")}</a>
        </form>
        <small className="home-trust-note">✓ {t("home.search.trust")}</small>
      </div>
    </section>

    <section className="home-map-section" aria-labelledby="workshop-map-title">
      <header>
        <p>{t("home.map.kicker")}</p>
        <h2 id="workshop-map-title">{t("home.map.title")}</h2>
        <span>{t("home.map.description")}</span>
      </header>
      <PublicWorkshopMap workshops={filtered} preferredDate={preferredDate} />
    </section>

    <section className="home-featured" id="featured-workshops">
      <header>
        <div><p>{t("home.featured.kicker")}</p><h2>{t("home.featured.title")}</h2></div>
        <Link href={`/workshops?date=${preferredDate}`}>{t("home.featured.all")} →</Link>
      </header>
      <div className="home-workshop-grid">
        {filtered.slice(0, 6).map((workshop) => <article className="home-workshop-card" key={workshop.id}>
          <div className="home-workshop-avatar">{initials(workshop.name)}</div>
          <span className="home-verified">✓ {t("home.verified")}</span>
          <h3>{workshop.name}</h3>
          <strong>{workshop.serviceCategories.slice(0, 2).join(" · ") || t("home.generalRepairs")}</strong>
          <p>{workshop.city || workshop.countryCode}<br />{workshop.address}</p>
          <div className="workshop-features">
            {workshop.offersPickup && <span>✓ {t("home.vehiclePickup")}</span>}
            {workshop.offersCourtesyCar && <span>✓ {t("home.courtesyCar")}</span>}
          </div>
          <b>{formatPrice(workshop.priceFromCents)}</b>
          <Link href={`/workshops/${workshop.slug}?date=${preferredDate}`}>{t("home.viewWorkshop")}</Link>
        </article>)}
        {!filtered.length && <div className="booking-empty"><h3>{t("home.empty.title")}</h3><p>{t("home.empty.description")}</p></div>}
      </div>
    </section>

    <section className="home-specialty-strip" id="services">
      <p>{t("home.services.kicker")}</p><h2>{t("home.services.title")}</h2>
      <div>{categories.map((item) => <button type="button" key={item} onClick={() => { setCategory(item); document.getElementById("featured-workshops")?.scrollIntoView({ behavior: "smooth" }); }}>{item}</button>)}</div>
    </section>

    <section className="provider-offer">
      <div><p>{t("home.offer.kicker")}</p><h2>{t("home.offer.title")}</h2><span>{t("home.offer.description")}</span></div>
      <div><strong>€35</strong><span>{t("home.offer.month")}</span><b>{t("home.offer.sms")}</b><Link href="/register/workshop-manager">{t("home.offer.join")}</Link></div>
    </section>

    <footer className="home-footer" id="legal">
      <div><strong>{t("home.footer.customers")}</strong><Link href="/workshops">{t("home.nav.findWorkshop")}</Link><Link href="/garage">{t("home.nav.garage")}</Link><Link href="/customer/login">{t("home.footer.signIn")}</Link></div>
      <div><strong>{t("home.footer.providers")}</strong><Link href="/register/workshop-manager">{t("home.footer.join")}</Link><Link href="/service-organisation/login">{t("home.footer.providerSignIn")}</Link><span>€35/{t("home.offer.month")} · {t("home.offer.sms")}</span></div>
      <div><strong>{t("home.footer.legal")}</strong><a href="#legal">{t("home.footer.terms")}</a><a href="#legal">{t("home.footer.privacy")}</a><a href="#legal">{t("home.footer.cookies")}</a></div>
      <div><strong>{t("home.footer.contact")}</strong><a href={`mailto:${brand.supportEmail}`}>{t("home.footer.support")}</a><a href={`mailto:${brand.supportEmail}?subject=${encodeURIComponent(`${brand.name} problem report`)}`}>{t("home.footer.report")}</a></div>
      <p>© {new Date().getFullYear()} {brand.name}</p>
    </footer>
  </main>;
}
