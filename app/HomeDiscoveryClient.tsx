"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import GoogleDoctorMap from "./GoogleDoctorMap";
import GoogleAddressSearch, { type GoogleAddressSelection } from "./GoogleAddressSearch";
import { translate, type Language, type TranslationKey } from "@/app/i18n";
import { clinicianSpecialtyKey } from "@/app/i18n/admin-values";
import { useLanguage } from "@/app/i18n/useLanguage";
import { brand } from "@/lib/brand";
import { distanceInKilometers } from "@/lib/geo";
import type { PublicDoctor } from "@/lib/dal/public-appointments";

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export default function HomeDiscoveryClient({
  doctors,
  date,
}: {
  doctors: PublicDoctor[];
  date: string;
}) {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [locationText, setLocationText] = useState("");
  const [locationSelection, setLocationSelection] = useState<GoogleAddressSelection | null>(null);
  const [preferredDate, setPreferredDate] = useState(date);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const specialtyName = (value: string) => {
    const key = clinicianSpecialtyKey(value);
    return key === "admin.value.unknown" ? value : t(key);
  };
  const specialties = useMemo(
    () => [...new Set(doctors.map((doctor) => doctor.specialty))].sort(),
    [doctors],
  );
  const filtered = doctors.filter((doctor) => {
    const haystack = `${doctor.name} ${doctor.specialty} ${specialtyName(doctor.specialty)} ${doctor.clinicName} ${doctor.city ?? ""} ${doctor.practiceAddress ?? ""} ${doctor.clinicCountry}`.toLocaleLowerCase(language);
    const locationMatches = locationSelection
      && locationSelection.latitude !== null
      && locationSelection.longitude !== null
      ? doctor.latitude !== null && doctor.longitude !== null
        && distanceInKilometers(
          { latitude: locationSelection.latitude, longitude: locationSelection.longitude },
          { latitude: doctor.latitude, longitude: doctor.longitude },
        ) <= 50
      : !locationText.trim() || haystack.includes(locationText.trim().toLocaleLowerCase(language));
    return (!query.trim() || haystack.includes(query.trim().toLocaleLowerCase(language)))
      && (!specialty || doctor.specialty === specialty)
      && locationMatches;
  });
  const selected = filtered.find((doctor) => doctor.id === selectedId) ?? null;

  return <main className="home-shell">
    <header className="home-header">
      <Link href="/" className="home-logo"><span>{brand.mark}</span>{brand.name}</Link>
      <nav>
        <Link href="/appointments">{ready ? t("home.doctors") : "Doctors"}</Link>
        <a href="#specialties">{ready ? t("home.specialties") : "Specialties"}</a>
        <Link href="/patient/appointments">{ready ? t("home.myAppointments") : "My appointments"}</Link>
        <Link href="/doctor/login">{ready ? t("home.forProfessionals") : "For professionals"}</Link>
      </nav>
      <select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={ready ? t("a11y.languageSelector") : "Language"}>
        <option value="en">EN</option><option value="de">DE</option>
        <option value="ro">RO</option><option value="hu">HU</option>
      </select>
    </header>

    <section className="home-discovery">
      <div className="home-map" aria-label={ready ? t("home.mapLabel") : "Doctor locations"}>
        <GoogleDoctorMap
          doctors={filtered}
          selectedId={selectedId}
          onSelect={setSelectedId}
          labels={{
            mapLabel: ready ? t("home.mapLabel") : "Doctor locations",
            noResults: ready ? t("home.noMapResults") : "No matching locations",
            noPreciseLocations: ready ? t("home.noPreciseLocations") : "Add Doctor coordinates to display precise locations.",
            previewCoverage: ready ? t("home.mapCoverage") : "Romania · Location preview",
            unavailable: ready ? t("home.mapUnavailable") : "Google Maps is temporarily unavailable · Preview shown",
          }}
        />
        {selected && <article className="map-doctor-preview">
          <button type="button" onClick={() => setSelectedId(null)} aria-label={ready ? t("home.closePreview") : "Close"}>×</button>
          <small>{specialtyName(selected.specialty)}</small>
          <strong>{selected.name}</strong>
          <span>{selected.clinicName} · {selected.city || selected.clinicCountry}</span>
          <Link href={`/doctors/${selected.id}?date=${preferredDate}`}>{ready ? t("home.viewDoctor") : "View Doctor"}</Link>
        </article>}
      </div>

      <div className="home-search-panel">
        <div>
          <p>{ready ? t("home.kicker") : "Healthcare, made easier"}</p>
          <h1>{ready ? t("home.title") : "Find the right Doctor near you"}</h1>
          <span>{ready ? t("home.description") : "Search verified Doctors, compare options and request an appointment online."}</span>
        </div>
        <form className="home-filter-form" onSubmit={(event) => event.preventDefault()}>
          <label><span>{ready ? t("home.searchLabel") : "Doctor or clinic"}</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ready ? t("home.searchPlaceholder") : "Name, clinic or address"} />
          </label>
          <div>
            <label><span>{ready ? t("home.specialtyLabel") : "Specialty"}</span>
              <select value={specialty} onChange={(event) => setSpecialty(event.target.value)}>
                <option value="">{ready ? t("home.allSpecialties") : "All specialties"}</option>
                {specialties.map((item) => <option key={item} value={item}>{specialtyName(item)}</option>)}
              </select>
            </label>
            <GoogleAddressSearch label={ready ? t("home.locationLabel") : "Location"} placeholder={ready ? t("home.addressSearchPlaceholder") : "Search an address or city"} help={ready ? t("home.addressSearchHelp") : "Select a Google address to find Doctors within 50 km."} unavailable={ready ? t("home.addressSearchFallback") : "Google address search is unavailable. Type a city or address."} language={language} formFields={false} onSelection={setLocationSelection} onTextChange={setLocationText} />
          </div>
          <label><span>{ready ? t("home.dateLabel") : "Preferred date"}</span>
            <input type="date" value={preferredDate} min={date} onChange={(event) => setPreferredDate(event.target.value)} />
          </label>
          <div className="home-search-summary">
            <strong>{filtered.length}</strong>
            <span>{ready ? t("home.matches") : "matching Doctors"}</span>
          </div>
          <a className="home-results-button" href="#featured-doctors">{ready ? t("home.showDoctors") : "Show Doctors"}</a>
        </form>
        <small className="home-trust-note">✓ {ready ? t("home.noPayment") : "No payment required to request an appointment"}</small>
      </div>
    </section>

    <section className="home-featured" id="featured-doctors">
      <header>
        <div><p>{ready ? t("home.featuredKicker") : "Care you can trust"}</p><h2>{ready ? t("home.featuredTitle") : "Doctors available on the platform"}</h2></div>
        <Link href={`/appointments?date=${preferredDate}`}>{ready ? t("home.viewAll") : "View all Doctors"} →</Link>
      </header>
      <div className="home-doctor-grid">
        {filtered.slice(0, 6).map((doctor) => <article className="home-doctor-card" key={doctor.id}>
          <div className="home-doctor-avatar">{initials(doctor.name)}</div>
          <span className="home-verified">✓ {ready ? t("booking.verifiedDoctor") : "Verified Doctor"}</span>
          <h3>{doctor.name}</h3>
          <strong>{specialtyName(doctor.specialty)}</strong>
          <p>{doctor.clinicName}<br />{doctor.city || doctor.clinicCountry}</p>
          <div className="home-rating" aria-label={ready ? t("home.noRatings") : "No ratings yet"}><span>☆☆☆☆☆</span> (0)</div>
          <Link href={`/doctors/${doctor.id}?date=${preferredDate}`}>{ready ? t("home.viewDoctor") : "View Doctor"}</Link>
        </article>)}
        {!filtered.length && <div className="booking-empty"><h3>{ready ? t("booking.noDoctors") : "No Doctors found"}</h3><p>{ready ? t("booking.tryAnotherSearch") : "Try another search."}</p></div>}
      </div>
    </section>

    <section className="home-specialty-strip" id="specialties">
      <p>{ready ? t("home.specialtiesKicker") : "Browse by specialty"}</p>
      <h2>{ready ? t("home.specialtiesTitle") : "Find care for what you need"}</h2>
      <div>{specialties.slice(0, 12).map((item) => <button type="button" key={item} onClick={() => { setSpecialty(item); document.getElementById("featured-doctors")?.scrollIntoView({ behavior: "smooth" }); }}>{specialtyName(item)}</button>)}</div>
    </section>

    <footer className="home-footer" id="legal">
      <div><strong>{ready ? t("footer.platform") : "Platform"}</strong>
        <Link href="/">{ready ? t("footer.home") : "Home"}</Link>
        <Link href="/appointments">{ready ? t("footer.doctors") : "Doctors"}</Link>
        <a href="#specialties">{ready ? t("footer.specialties") : "Specialties"}</a>
        <Link href="/patient">{ready ? t("footer.patientGuide") : "Patient guide"}</Link>
        <Link href="/register">{ready ? t("footer.createAccount") : "Create account"}</Link>
        <Link href="/patient/login">{ready ? t("footer.signIn") : "Sign in"}</Link>
      </div>
      <div><strong>{ready ? t("footer.professionals") : "For professionals"}</strong>
        <Link href="/register/doctor">{ready ? t("footer.joinDoctor") : "Join as a Doctor"}</Link>
        <Link href="/register/clinic-manager">{ready ? t("footer.clinicOffer") : "Clinic offer"}</Link>
        <Link href="/doctor/login">{ready ? t("footer.doctorGuide") : "Guide for Doctors and clinics"}</Link>
        <Link href="/doctor/invoicing">{ready ? t("footer.subscription") : "Doctor subscription"}</Link>
        <Link href="/doctor/login">{ready ? t("footer.doctorSignIn") : "Doctor sign in"}</Link>
        <Link href="/register/doctor">{ready ? t("footer.verification") : "Professional verification"}</Link>
      </div>
      <div><strong>{ready ? t("footer.legal") : "Legal"}</strong>
        <a href="#legal">{ready ? t("footer.terms") : "Terms and conditions"}</a>
        <a href="#legal">{ready ? t("footer.privacy") : "Privacy policy"}</a>
        <a href="#legal">{ready ? t("footer.cookies") : "Cookie policy"}</a>
        <a href="#legal">{ready ? t("footer.legalInfo") : "Legal information"}</a>
        <a href="#legal">{ready ? t("footer.cookiePrivacy") : "Cookie and privacy information"}</a>
      </div>
      <div><strong>{ready ? t("footer.contact") : "Contact"}</strong>
        <a href={`mailto:${brand.supportEmail}`}>{ready ? t("footer.contactLink") : "Contact"}</a>
        <a href={`mailto:${brand.supportEmail}`}>{ready ? t("footer.support") : "Support"}</a>
        <a href={`mailto:${brand.supportEmail}?subject=${encodeURIComponent(`${brand.name} problem report`)}`}>{ready ? t("footer.reportProblem") : "Report a problem"}</a>
      </div>
      <p>© {new Date().getFullYear()} {brand.name}</p>
    </footer>
  </main>;
}
