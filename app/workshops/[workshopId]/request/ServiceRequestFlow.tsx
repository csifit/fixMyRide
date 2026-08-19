"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import PublicSiteHeader from "@/app/PublicSiteHeader";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { PublicWorkshop, PublicWorkshopBookingRules, PublicWorkshopService } from "@/lib/dal/public-workshops";
import { requestServiceAction, type ServiceRequestState } from "./actions";
import PlatformDateTimeInput from "@/app/PlatformDateTimeInput";
import { translate, type TranslationKey } from "@/app/i18n";
import { CustomerHint, CustomerPageGuide } from "@/app/guidance/CustomerGuidance";

const idle: ServiceRequestState = { status: "idle" };

function toIso(date: string, time: string) {
  if (!date || !time) return "";
  const value = new Date(`${date}T${time}:00`);
  return Number.isNaN(value.getTime()) ? "" : value.toISOString();
}

export default function ServiceRequestFlow({ workshop, service, rules, initialDate }: {
  workshop: PublicWorkshop;
  service: PublicWorkshopService;
  rules: PublicWorkshopBookingRules;
  initialDate: string;
}) {
  const [language] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  const [state, action, pending] = useActionState(requestServiceAction, idle);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("09:00");
  const [alternateDate, setAlternateDate] = useState("");
  const [alternateTime, setAlternateTime] = useState("09:00");
  const [vehicle, setVehicle] = useState({
    registration: "", make: "", model: "", year: "", vin: "", mileage: "", note: "", mobility: "none",
  });
  const [step, setStep] = useState<1 | 2>(1);
  const preferredStart = useMemo(() => toIso(date, time), [date, time]);
  const alternateStart = useMemo(
    () => alternateDate ? toIso(alternateDate, alternateTime) : "",
    [alternateDate, alternateTime],
  );
  const diagnosisFee = service.diagnosisFeeCents !== null && service.diagnosisCurrency
    ? new Intl.NumberFormat(language, { style: "currency", currency: service.diagnosisCurrency }).format(service.diagnosisFeeCents / 100)
    : null;
  if (state.status === "success") return <main className="booking-shell">
    <PublicSiteHeader />
    <section className="booking-complete">
      <span className="booking-complete-mark">✓</span><p className="registration-kicker">Request sent</p>
      <h1>Your service request is waiting for confirmation</h1>
      <p>{workshop.name} will review the requested time and vehicle details. Confirmation and future updates can be sent by email and SMS.</p>
      <article><strong>{service.name}</strong><span>{workshop.name}</span><b>{new Intl.DateTimeFormat(language, { dateStyle: "full", timeStyle: "short" }).format(new Date(preferredStart))}</b><small>This is a request, not a confirmed appointment yet.</small></article>
      <div><Link className="booking-primary" href="/garage">Go to My Garage</Link><Link href="/workshops">Find another workshop</Link></div>
    </section>
  </main>;

  return <main className="booking-shell">
    <PublicSiteHeader />
    <section className="booking-checkout service-request-checkout">
      <div className="booking-progress">
        <span className="done"><b>1</b>Service</span><i />
        <span className={step === 1 ? "active" : "done"}><b>2</b>Vehicle and time</span><i />
        <span className={step === 2 ? "active" : ""}><b>3</b>Contact and review</span>
      </div>
      <CustomerPageGuide title={t("phase6.request.title")} description={t("phase6.request.description")} steps={[t("phase6.request.step1"), t("phase6.request.step2"), t("phase6.request.step3")]} />
      <form action={action} className="booking-checkout-grid">
        <section className="booking-checkout-main">
          {step === 1 ? <>
            <p className="registration-kicker">Your vehicle</p><h1>Tell the workshop what you are bringing</h1>
            <p>These details help the workshop assess the request before confirming it.</p>
            <div className="booking-details-form automotive-request-form">
              <label>Registration number<input value={vehicle.registration} onChange={(event) => setVehicle({ ...vehicle, registration: event.target.value })} required maxLength={20} autoCapitalize="characters" placeholder="B 123 ABC" /></label>
              <label>Make<input value={vehicle.make} onChange={(event) => setVehicle({ ...vehicle, make: event.target.value })} required maxLength={80} placeholder="Volkswagen" /></label>
              <label>Model<input value={vehicle.model} onChange={(event) => setVehicle({ ...vehicle, model: event.target.value })} required maxLength={100} placeholder="Golf" /></label>
              <label>Year<input value={vehicle.year} onChange={(event) => setVehicle({ ...vehicle, year: event.target.value })} type="number" min="1886" max="2200" inputMode="numeric" /></label>
              <label>VIN (optional)<input value={vehicle.vin} onChange={(event) => setVehicle({ ...vehicle, vin: event.target.value.toUpperCase() })} minLength={17} maxLength={17} autoCapitalize="characters" /></label>
              <label>Mileage (km)<input value={vehicle.mileage} onChange={(event) => setVehicle({ ...vehicle, mileage: event.target.value })} type="number" min="0" max="5000000" inputMode="numeric" /></label>
              <label>Preferred date<PlatformDateTimeInput mode="date" value={date} min={rules.earliestBookingDate} max={rules.latestBookingDate} onChange={setDate} required ariaLabel="Preferred date" /><CustomerHint>{t("phase6.request.preferredHelp")}</CustomerHint></label>
              <label>Preferred arrival time<PlatformDateTimeInput mode="time" value={time} step={rules.slotIntervalMinutes * 60} onChange={setTime} required ariaLabel="Preferred arrival time" /></label>
              <label>Alternative date (optional)<PlatformDateTimeInput mode="date" value={alternateDate} min={rules.earliestBookingDate} max={rules.latestBookingDate} onChange={setAlternateDate} ariaLabel="Alternative date" /><CustomerHint>{t("phase6.request.alternativeHelp")}</CustomerHint></label>
              <label>Alternative time<PlatformDateTimeInput mode="time" value={alternateTime} step={rules.slotIntervalMinutes * 60} disabled={!alternateDate} onChange={setAlternateTime} ariaLabel="Alternative time" /></label>
              <label>What should the workshop know?<textarea value={vehicle.note} onChange={(event) => setVehicle({ ...vehicle, note: event.target.value })} maxLength={2000} placeholder="Describe the issue, warning lights, noises, or work requested." /><CustomerHint>{t("phase6.request.noteHelp")}</CustomerHint></label>
              <label>While the car is in service<select value={vehicle.mobility} onChange={(event) => setVehicle({ ...vehicle, mobility: event.target.value })}><option value="none">No special requirement</option>{rules.allowsWaitOnSite && <option value="wait_on_site">Wait on site</option>}{rules.offersPickup && <option value="pickup">Vehicle pickup</option>}{rules.offersCourtesyCar && <option value="courtesy_car">Courtesy car</option>}</select></label>
              <button type="button" onClick={() => setStep(2)} disabled={!preferredStart || vehicle.registration.trim().length < 2 || !vehicle.make.trim() || !vehicle.model.trim()}>Continue</button>
            </div>
          </> : <>
            <p className="registration-kicker">Contact details</p><h1>Where should the workshop send confirmation?</h1>
            <p>No payment is taken. The requested time only becomes an appointment after {workshop.name} confirms it.</p><CustomerHint>{t("phase6.request.confirmationHelp")}</CustomerHint>
            <div className="booking-details-form automotive-request-form">
              <label>Your name<input name="customerName" required minLength={2} maxLength={160} autoComplete="name" /></label>
              <label>Email<input name="customerEmail" type="email" required maxLength={320} autoComplete="email" /></label>
              <label>Mobile number<input name="customerPhone" required minLength={7} maxLength={40} autoComplete="tel" /></label>
            </div>
            <input type="hidden" name="workshopId" value={workshop.id} />
            <input type="hidden" name="serviceId" value={service.id} />
            <input type="hidden" name="vehicleRegistration" value={vehicle.registration} />
            <input type="hidden" name="vehicleMake" value={vehicle.make} />
            <input type="hidden" name="vehicleModel" value={vehicle.model} />
            <input type="hidden" name="vehicleYear" value={vehicle.year} />
            <input type="hidden" name="vehicleVin" value={vehicle.vin} />
            <input type="hidden" name="mileageKm" value={vehicle.mileage} />
            <input type="hidden" name="preferredStart" value={preferredStart} />
            <input type="hidden" name="alternateStart" value={alternateStart} />
            <input type="hidden" name="customerNote" value={vehicle.note} />
            <input type="hidden" name="mobilityRequirement" value={vehicle.mobility} />
            <input type="hidden" name="locale" value={language} />
            {service.bookingMode !== "direct" && <label className="booking-consent"><input type="checkbox" name="diagnosisAccepted" value="yes" required /><span>I understand that the initial diagnosis fee of {diagnosisFee ?? "the displayed amount"} remains payable if I decline further repair work.</span></label>}
            <label className="booking-consent"><input type="checkbox" name="privacyAccepted" value="yes" required /><span>I agree that the workshop may use these details to assess and manage this booking request.</span></label>
            {state.status !== "idle" && <p className="appointment-error">{state.status === "invalid" ? "Please check all details and try again." : "The request could not be saved. Please try again shortly."}</p>}
            <div className="service-request-actions"><button type="button" className="booking-secondary" onClick={() => setStep(1)}>Back</button><button disabled={pending}>{pending ? "Sending request…" : "Send booking request"}</button></div>
          </>}
        </section>
        <aside className="booking-summary-card">
          <span>Your selection</span><h2>{service.name}</h2><p>{service.category}</p><hr />
          <strong>{workshop.name}</strong><small>{workshop.city || workshop.countryCode}</small><hr />
          {date ? <strong>{new Intl.DateTimeFormat(language, { dateStyle: "full" }).format(new Date(`${date}T12:00:00`))} · {time}</strong> : <strong>Choose a preferred time</strong>}
          {service.bookingMode === "direct" ? <b>✓ Direct service request · no card required</b> : <b>✓ Diagnosis first · {diagnosisFee} fee disclosed</b>}<small>The workshop may suggest a different time after reviewing your request.</small>
          <Link href={`/workshops/${workshop.slug}`}>Choose another service</Link>
        </aside>
      </form>
    </section>
  </main>;
}
