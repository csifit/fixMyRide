"use client";

import Link from "next/link";
import { useActionState } from "react";
import PublicBookingHeader from "@/app/appointments/PublicBookingHeader";
import type { GarageBooking, GarageVehicle } from "@/lib/dal/garage";
import { addVehicleAction, type GarageActionState } from "./actions";

const idle: GarageActionState = { status: "idle" };

export default function GarageClient({ vehicles, bookings }: { vehicles: GarageVehicle[]; bookings: GarageBooking[] }) {
  const [state, action, pending] = useActionState(addVehicleAction, idle);
  return <main className="booking-shell garage-page">
    <PublicBookingHeader />
    <section className="garage-intro"><div><p>Customer account</p><h1>My Garage</h1><span>Keep your vehicles, booking requests, and service history together.</span></div><Link href="/workshops">Book a service</Link></section>
    <section className="garage-grid">
      <div className="garage-main">
        <header><div><p>Your vehicles</p><h2>{vehicles.length} {vehicles.length === 1 ? "vehicle" : "vehicles"}</h2></div></header>
        <div className="garage-vehicle-grid">
          {vehicles.map((vehicle) => <article key={vehicle.id}>
            <span>🚗</span><div><small>{vehicle.nickname || "Vehicle"}</small><h3>{vehicle.make} {vehicle.model}</h3><b>{vehicle.registrationNumber}</b><p>{[vehicle.productionYear, vehicle.fuelType, vehicle.currentMileageKm != null ? `${vehicle.currentMileageKm.toLocaleString()} km` : null].filter(Boolean).join(" · ")}</p></div>
          </article>)}
          {!vehicles.length && <div className="booking-empty compact"><h3>Add your first vehicle</h3><p>Your vehicles will appear here and can be reused for future service requests.</p></div>}
        </div>
        <section className="garage-bookings"><header><p>Bookings and service history</p><h2>Recent requests</h2></header>
          {bookings.map((booking) => <article key={booking.id}><div><strong>{booking.vehicleMake} {booking.vehicleModel}</strong><span>{booking.vehicleRegistration}</span></div><div><b>{booking.status.replaceAll("_", " ")}</b><span>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(booking.confirmedStart || booking.preferredStart))}</span></div></article>)}
          {!bookings.length && <div className="booking-empty compact"><h3>No service requests yet</h3><p>When you request a booking, its confirmation status will appear here.</p></div>}
        </section>
      </div>
      <aside className="garage-add"><p>Add a vehicle</p><h2>Vehicle details</h2><form action={action}>
        <label>Registration number<input name="registrationNumber" required maxLength={20} placeholder="B 123 ABC" /></label>
        <div><label>Make<input name="make" required maxLength={80} /></label><label>Model<input name="model" required maxLength={100} /></label></div>
        <div><label>Year<input name="productionYear" type="number" min="1886" max="2200" /></label><label>Mileage (km)<input name="currentMileageKm" type="number" min="0" max="5000000" /></label></div>
        <label>VIN (optional)<input name="vin" minLength={17} maxLength={17} /></label>
        <div><label>Fuel<select name="fuelType" defaultValue=""><option value="">Not specified</option><option value="petrol">Petrol</option><option value="diesel">Diesel</option><option value="hybrid">Hybrid</option><option value="electric">Electric</option><option value="lpg">LPG</option><option value="other">Other</option></select></label><label>Nickname<input name="nickname" maxLength={60} placeholder="Family car" /></label></div>
        <label>Engine (optional)<input name="engineDescription" maxLength={120} placeholder="2.0 TDI" /></label>
        {state.status !== "idle" && <p className={state.status === "saved" ? "appointment-success" : "appointment-error"}>{state.status === "saved" ? "Vehicle saved." : state.status === "invalid" ? "Please check the vehicle details." : "The vehicle could not be saved."}</p>}
        <button disabled={pending}>{pending ? "Saving…" : "Add to My Garage"}</button>
      </form></aside>
    </section>
  </main>;
}
