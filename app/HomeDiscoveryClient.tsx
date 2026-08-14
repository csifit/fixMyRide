"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import GoogleAddressSearch, { type GoogleAddressSelection } from "./GoogleAddressSearch";
import PublicWorkshopMap from "./PublicWorkshopMap";
import { translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { brand } from "@/lib/brand";
import { distanceInKilometers } from "@/lib/geo";
import PublicProviderMenu from "./PublicProviderMenu";
import type { PublicWorkshop } from "@/lib/dal/public-workshops";
import {
  standardServiceTemplates,
  vehicleTypes,
  type AutomotiveVehicleType,
} from "@/lib/automotive-service-catalogue";

type HomeVehicleType = AutomotiveVehicleType | "electric_vehicle";
type HomeServiceCategory = { name: string; services: string[] };

const electricVehicleServiceCategories: HomeServiceCategory[] = [
  { name: "Diagnostics and safety", services: ["Electric vehicle diagnosis", "Warning light or fault-code diagnostics", "Vehicle will not start or enter drive mode", "High-voltage system safety inspection", "Electrical insulation fault diagnosis", "Pre-purchase EV inspection", "Accident or water-damage inspection", "I'm not sure what's wrong"] },
  { name: "Routine servicing", services: ["EV manufacturer-scheduled service", "EV interim service", "EV full service", "Brake-fluid change", "Cabin-filter replacement", "Windscreen washer and wiper service", "General mechanical inspection"] },
  { name: "High-voltage battery", services: ["High-voltage battery health and state-of-health check", "Reduced-range diagnosis", "Battery-management-system diagnosis", "Battery cell or module diagnosis", "High-voltage battery balancing", "High-voltage battery repair", "High-voltage battery replacement", "Battery enclosure and seal inspection"] },
  { name: "Charging system", services: ["AC charging fault diagnosis", "DC rapid-charging fault diagnosis", "Charging-port inspection or repair", "Charging-port replacement", "On-board charger diagnosis or replacement", "Charging cable test or replacement", "Charge-lock actuator repair", "12-volt battery test or replacement"] },
  { name: "Thermal management and climate", services: ["EV cooling-system diagnosis", "High-voltage battery cooling service", "EV coolant change", "Coolant pump or valve replacement", "Heat-pump diagnosis or repair", "Air-conditioning inspection or recharge", "Cabin heating fault diagnosis"] },
  { name: "Electric drive system", services: ["Electric drive-motor diagnosis or repair", "Inverter diagnosis or replacement", "Power-electronics diagnosis", "Reduction gearbox service or repair", "Drive-unit noise or vibration diagnosis", "Driveshaft or CV-joint replacement"] },
  { name: "Brakes, steering, and suspension", services: ["Brake inspection", "Brake-pad replacement", "Brake-disc replacement", "Regenerative-braking diagnosis", "Suspension inspection or repair", "Steering inspection or repair", "Wheel-bearing replacement"] },
  { name: "EV tyres and wheels", services: ["EV-rated tyre fitting", "Seasonal tyre change", "Puncture repair", "Wheel balancing", "Wheel alignment", "Tyre rotation", "TPMS diagnosis or sensor replacement"] },
  { name: "Software and low-voltage electronics", services: ["Vehicle software and firmware update", "Infotainment or connectivity diagnosis", "Driver-assistance system diagnosis", "Camera or radar calibration", "Low-voltage wiring repair", "Lighting repair", "Key, access, or immobiliser diagnosis"] },
];

const homeVehicleTypes: HomeVehicleType[] = [
  "car_van",
  "electric_vehicle",
  ...vehicleTypes.filter((vehicleType) => vehicleType !== "car_van"),
];

function serviceCategoriesFor(vehicleType: HomeVehicleType): HomeServiceCategory[] {
  if (vehicleType === "electric_vehicle") return electricVehicleServiceCategories;
  const categories = new Map<string, string[]>();
  standardServiceTemplates
    .filter((service) => service.vehicleType === vehicleType)
    .filter((service) => service.category !== "Electric and hybrid vehicles")
    .forEach((service) => categories.set(
      service.category,
      [...(categories.get(service.category) ?? []), service.name],
    ));
  return [...categories.entries()].map(([name, services]) => ({ name, services }));
}

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
  const [activeServiceVehicle, setActiveServiceVehicle] = useState<HomeVehicleType>("car_van");
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
        <Link href="/customer/login">{t("home.nav.garage")}</Link>
        <PublicProviderMenu labels={{
          menu: t("home.nav.providers"),
          serviceOrganisation: t("home.nav.serviceOrganisationAccess"),
          workshop: t("home.nav.workshopLogin"),
          signIn: t("home.nav.signIn"),
          register: t("home.nav.register"),
          invitationOnly: t("home.nav.invitationOnly"),
        }} />
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
      <header>
        <p>{t("home.services.kicker")}</p>
        <h2>{t("home.services.title")}</h2>
        <span>{t("home.services.description")}</span>
      </header>
      <div className="home-service-directory">
        <div className="home-service-tabs" role="tablist" aria-label={t("home.services.vehicleTypes")} aria-orientation="vertical">
          <strong>{t("home.services.vehicleTypes")}</strong>
          {homeVehicleTypes.map((vehicleType, index) => <button
            type="button"
            role="tab"
            id={`service-tab-${vehicleType}`}
            aria-controls={`service-panel-${vehicleType}`}
            aria-selected={activeServiceVehicle === vehicleType}
            tabIndex={activeServiceVehicle === vehicleType ? 0 : -1}
            key={vehicleType}
            onClick={() => setActiveServiceVehicle(vehicleType)}
            onKeyDown={(event) => {
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const nextIndex = event.key === "Home"
                ? 0
                : event.key === "End"
                  ? homeVehicleTypes.length - 1
                  : (index + (event.key === "ArrowDown" ? 1 : -1) + homeVehicleTypes.length) % homeVehicleTypes.length;
              const nextVehicle = homeVehicleTypes[nextIndex];
              setActiveServiceVehicle(nextVehicle);
              document.getElementById(`service-tab-${nextVehicle}`)?.focus();
            }}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {t(`serviceCatalogue.vehicleType.${vehicleType}` as TranslationKey)}
          </button>)}
        </div>
        {homeVehicleTypes.map((vehicleType) => {
          const groups = serviceCategoriesFor(vehicleType);
          const serviceCount = groups.reduce((total, group) => total + group.services.length, 0);
          return <section
            className="home-vehicle-services"
            id={`service-panel-${vehicleType}`}
            role="tabpanel"
            aria-labelledby={`service-tab-${vehicleType}`}
            hidden={activeServiceVehicle !== vehicleType}
            key={vehicleType}
          >
            <header>
              <h3>{t(`serviceCatalogue.vehicleType.${vehicleType}` as TranslationKey)}</h3>
              <span>{serviceCount} {t("home.services.options")}</span>
            </header>
            <div>
              {groups.map((group) => <article key={group.name}>
                <h4>{group.name}</h4>
                <ul>{group.services.map((service) => <li key={service}>{service}</li>)}</ul>
              </article>)}
            </div>
          </section>;
        })}
      </div>
    </section>

    <section className="provider-offer">
      <div className="provider-offer-pitch">
        <p>{t("home.offer.kicker")}</p><h2>{t("home.offer.title")}</h2><span>{t("home.offer.description")}</span>
        <ul className="provider-offer-highlights"><li>{t("home.offer.highlight.bookings")}</li><li>{t("home.offer.highlight.operations")}</li><li>{t("home.offer.highlight.growth")}</li></ul>
        <details className="provider-benefits">
          <summary><span>{t("home.offer.benefits.open")}</span><small>{t("home.offer.benefits.hint")}</small></summary>
          <div>
            <section><h3>{t("home.offer.benefits.organisations")}</h3><ul>
              <li>{t("home.offer.benefit.organisationOverview")}</li><li>{t("home.offer.benefit.locationComparison")}</li><li>{t("home.offer.benefit.consolidatedBilling")}</li><li>{t("home.offer.benefit.qualityControl")}</li><li>{t("home.offer.benefit.managerControl")}</li><li>{t("home.offer.benefit.reporting")}</li>
            </ul></section>
            <section><h3>{t("home.offer.benefits.workshops")}</h3><ul>
              <li>{t("home.offer.benefit.onlineBookings")}</li><li>{t("home.offer.benefit.calendar")}</li><li>{t("home.offer.benefit.repairLifecycle")}</li><li>{t("home.offer.benefit.inventory")}</li><li>{t("home.offer.benefit.serviceHistory")}</li><li>{t("home.offer.benefit.loyalty")}</li>
            </ul></section>
          </div>
        </details>
      </div>
      <aside className="provider-offer-price"><strong>€35</strong><span>{t("home.offer.month")}</span><b>{t("home.offer.sms")}</b><Link href="/register/workshop-manager">{t("home.offer.join")}</Link><Link className="provider-offer-guide" href="/guides/service-providers">{t("home.offer.learnMore")}</Link></aside>
    </section>

    <footer className="home-footer" id="legal">
      <div><strong>{t("home.footer.customers")}</strong><Link href="/workshops">{t("home.nav.findWorkshop")}</Link><Link href="/customer/login">{t("home.nav.garage")}</Link><Link href="/guides/customers">{t("home.footer.customerGuide")}</Link><Link href="/customer/login">{t("home.footer.signIn")}</Link></div>
      <div><strong>{t("home.footer.providers")}</strong><Link href="/register/workshop-manager">{t("home.footer.join")}</Link><Link href="/guides/service-providers">{t("home.footer.providerGuide")}</Link><Link href="/service-organisation/login">{t("home.footer.providerSignIn")}</Link></div>
      <div><strong>{t("home.footer.legal")}</strong><Link href="/terms">{t("home.footer.terms")}</Link><Link href="/privacy">{t("home.footer.privacy")}</Link><Link href="/cookies">{t("home.footer.cookies")}</Link></div>
      <div><strong>{t("home.footer.contact")}</strong><Link href="/faq">{t("home.footer.faq")}</Link><Link href="/contact?type=support">{t("home.footer.support")}</Link><Link href="/contact?type=problem">{t("home.footer.report")}</Link></div>
      <p>© {new Date().getFullYear()} {brand.name}</p>
    </footer>
  </main>;
}
