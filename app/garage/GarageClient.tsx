"use client";

import Link from "next/link";
import { useActionState } from "react";
import PublicSiteHeader from "@/app/PublicSiteHeader";
import { locales, translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { CustomerHint, CustomerPageGuide } from "@/app/guidance/CustomerGuidance";
import type { GarageBooking, GarageVehicle } from "@/lib/dal/garage";
import { addVehicleAction, type GarageActionState } from "./actions";

const idle: GarageActionState = { status: "idle" };

// "My Garage" and "Bookings and service history" are canonical feature names; visible copy is localized below.
export default function GarageClient({ vehicles, bookings }: { vehicles: GarageVehicle[]; bookings: GarageBooking[] }) {
  const [language, , ready] = useLanguage();
  const [state, action, pending] = useActionState(addVehicleAction, idle);
  const t = (key: TranslationKey) => translate(language, key);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  return <main className="booking-shell garage-page">
    <PublicSiteHeader />
    <section className="garage-intro"><div><p>{t("garage.eyebrow")}</p><h1>{t("garage.title")}</h1><span>{t("garage.description")}</span></div><Link href="/workshops">{t("garage.bookService")}</Link></section>
    <section className="garage-guidance-wrap"><CustomerPageGuide
      title={t("phase6.garage.title")}
      description={t("phase6.garage.description")}
      steps={[t("phase6.garage.step1"), t("phase6.garage.step2"), t("phase6.garage.step3")]}
    /></section>
    <section className="garage-grid">
      <div className="garage-main">
        <header><div><p>{t("garage.vehiclesEyebrow")}</p><h2>{vehicles.length} {t(vehicles.length === 1 ? "garage.vehicle" : "garage.vehicles")}</h2></div></header>
        <div className="garage-vehicle-grid">
          {vehicles.map((vehicle) => <article key={vehicle.id}>
            <span>🚗</span><div><small>{vehicle.nickname || t("garage.vehicle")}</small><h3>{vehicle.make} {vehicle.model}</h3><b>{vehicle.registrationNumber}</b><p>{[vehicle.productionYear, vehicle.fuelType ? t(`garage.fuel.${vehicle.fuelType}` as TranslationKey) : null, vehicle.currentMileageKm != null ? `${vehicle.currentMileageKm.toLocaleString(locales[language])} km` : null].filter(Boolean).join(" · ")}</p><Link href={`/garage/${vehicle.id}`}>{t("garage.viewHistory")} →</Link></div>
          </article>)}
          {!vehicles.length && <div className="booking-empty compact"><h3>{t("garage.emptyVehicleTitle")}</h3><p>{t("garage.emptyVehicleDescription")}</p></div>}
        </div>
        <section className="garage-bookings"><header><div><p>{t("garage.bookingsEyebrow")}</p><h2>{t("garage.recentRequests")}</h2></div><Link href="/customer/bookings">{t("garage.manageBookings")} →</Link></header>
          {bookings.map((booking) => <article key={booking.id}><div><strong>{booking.vehicleMake} {booking.vehicleModel}</strong><span>{booking.vehicleRegistration}</span></div><div><b>{t(`workshopBookings.status.${booking.status}` as TranslationKey)}</b><span>{new Intl.DateTimeFormat(locales[language], { dateStyle: "medium", timeStyle: "short" }).format(new Date(booking.confirmedStart || booking.preferredStart))}</span></div></article>)}
          {!bookings.length && <div className="booking-empty compact"><h3>{t("garage.emptyBookingsTitle")}</h3><p>{t("garage.emptyBookingsDescription")}</p></div>}
        </section>
      </div>
      <aside className="garage-add"><p>{t("garage.addEyebrow")}</p><h2>{t("garage.vehicleDetails")}</h2><form action={action}>
        <label>{t("garage.registration")}<input name="registrationNumber" required maxLength={20} placeholder="B 123 ABC" /><CustomerHint>{t("phase6.garage.registrationHelp")}</CustomerHint></label>
        <div><label>{t("garage.make")}<input name="make" required maxLength={80} /></label><label>{t("garage.model")}<input name="model" required maxLength={100} /></label></div>
        <div><label>{t("garage.year")}<input name="productionYear" type="number" min="1886" max="2200" /></label><label>{t("garage.mileage")}<input name="currentMileageKm" type="number" min="0" max="5000000" /><CustomerHint>{t("phase6.garage.mileageHelp")}</CustomerHint></label></div>
        <label>{t("garage.vin")}<input name="vin" minLength={17} maxLength={17} /><CustomerHint>{t("phase6.garage.vinHelp")}</CustomerHint></label>
        <div><label>{t("garage.fuel")}<select name="fuelType" defaultValue=""><option value="">{t("garage.notSpecified")}</option><option value="petrol">{t("garage.fuel.petrol")}</option><option value="diesel">{t("garage.fuel.diesel")}</option><option value="hybrid">{t("garage.fuel.hybrid")}</option><option value="electric">{t("garage.fuel.electric")}</option><option value="lpg">{t("garage.fuel.lpg")}</option><option value="other">{t("garage.fuel.other")}</option></select></label><label>{t("garage.nickname")}<input name="nickname" maxLength={60} placeholder={t("garage.nicknamePlaceholder")} /></label></div>
        <label>{t("garage.engine")}<input name="engineDescription" maxLength={120} placeholder="2.0 TDI" /></label>
        {state.status !== "idle" && <p className={state.status === "saved" ? "appointment-success" : "appointment-error"}>{t(`garage.result.${state.status}` as TranslationKey)}</p>}
        <button disabled={pending}>{t(pending ? "garage.saving" : "garage.addVehicle")}</button>
      </form></aside>
    </section>
  </main>;
}
