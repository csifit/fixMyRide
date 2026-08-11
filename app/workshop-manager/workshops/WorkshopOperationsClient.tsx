"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import GoogleAddressSearch from "@/app/GoogleAddressSearch";
import { formatDateTime, translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { WorkshopClosure, WorkshopOperations } from "@/lib/dal/workshop-operations";
import { addWorkshopClosureAction, createWorkshopLocationAction, removeWorkshopClosureAction, updateWorkshopOperationsAction, type WorkshopOperationsActionState } from "./actions";

const idle: WorkshopOperationsActionState = { status: "idle" };
type T = (key: TranslationKey) => string;

function Result({ state, t }: { state: WorkshopOperationsActionState; t: T }) {
  if (state.status === "idle") return null;
  return <p role="status" className={["saved", "created", "location_created", "removed"].includes(state.status) ? "note-success" : "note-error"}>{t(`workshopOperations.result.${state.status}` as TranslationKey)}</p>;
}

type OwnedProvider = { id: string; displayName: string; countryCode: string };

function CreateLocationForm({ providers, language, t }: { providers: OwnedProvider[]; language: Language; t: T }) {
  const [state, action, pending] = useActionState(createWorkshopLocationAction, idle);
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const provider = providers.find((item) => item.id === providerId) ?? providers[0];
  if (!provider) return null;
  return <details className="settings-accordion create-location-panel">
    <summary><span><strong>{t("workshopOperations.addLocation")}</strong><small>{t("workshopOperations.addLocationHelp")}</small></span><b>+</b></summary>
    <form className="settings-card create-location-form" action={action}>
      {providers.length > 1 ? <label>{t("workshopOperations.organisation")}<select name="serviceProviderId" value={provider.id} onChange={(event) => setProviderId(event.target.value)}>{providers.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label> : <input type="hidden" name="serviceProviderId" value={provider.id} />}
      <label>{t("workshopOperations.displayName")}<input name="displayName" required minLength={2} maxLength={160} /></label>
      <div className="settings-two"><label>{t("workshopOperations.phone")}<input name="publicPhone" maxLength={40} /></label><label>{t("workshopOperations.email")}<input name="publicEmail" type="email" maxLength={320} /></label></div>
      <GoogleAddressSearch key={provider.id} label={t("workshopOperations.address")} placeholder={t("home.addressSearchPlaceholder")} help={t("workspace.addressSearchHelp")} unavailable={t("workspace.addressSearchFallback")} language={language} initialCountryCode={provider.countryCode} disabled={pending} />
      <p className="coverage-note">{t("workshopOperations.newLocationCoverageHelp")}</p>
      <Result state={state} t={t} />
      <button disabled={pending}>{t(pending ? "workshopOperations.creatingLocation" : "workshopOperations.createLocation")}</button>
      {state.status === "location_created" && <div className="create-location-next"><Link href="/workshop-manager/organisation">{t("workshopOperations.assignPrimaryManager")}</Link><Link href="/workshop-manager/invoicing">{t("workshopOperations.activateCoverage")}</Link></div>}
    </form>
  </details>;
}

function RemoveClosure({ closure, language, t }: { closure: WorkshopClosure; language: Language; t: T }) {
  const [state, action, pending] = useActionState(removeWorkshopClosureAction, idle);
  return <article><span><strong>{closure.reason || t("workshopOperations.closure.defaultReason")}</strong><small>{formatDateTime(language, closure.startsAt)} → {formatDateTime(language, closure.endsAt)}</small></span><form action={action}><input type="hidden" name="closureId" value={closure.id} /><button disabled={pending}>{t("workshopOperations.closure.remove")}</button></form><Result state={state} t={t} /></article>;
}

function ClosureForm({ workshopId, t }: { workshopId: string; t: T }) {
  const [state, action, pending] = useActionState(addWorkshopClosureAction, idle);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const iso = (value: string) => value ? new Date(value).toISOString() : "";
  return <form className="operations-closure-form" action={action}><input type="hidden" name="workshopId" value={workshopId} /><input type="hidden" name="startsAt" value={iso(startsAt)} /><input type="hidden" name="endsAt" value={iso(endsAt)} /><label>{t("workshopOperations.closure.starts")}<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></label><label>{t("workshopOperations.closure.ends")}<input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required /></label><label>{t("workshopOperations.closure.reason")}<input name="reason" maxLength={240} /></label><Result state={state} t={t} /><button disabled={pending}>{t(pending ? "workshopOperations.saving" : "workshopOperations.closure.add")}</button></form>;
}

function WorkshopForm({ workshop, language, t }: { workshop: WorkshopOperations; language: Language; t: T }) {
  const [state, action, pending] = useActionState(updateWorkshopOperationsAction, idle);
  return <details className="settings-accordion operations-workshop" open><summary><span><strong>{workshop.displayName}</strong><small>{workshop.city || workshop.countryCode} · {workshop.serviceProviderName}</small></span><b>{workshop.status}</b></summary>
    <form className="settings-card operations-form" action={action}><input type="hidden" name="workshopId" value={workshop.id} />
      <section><h3>{t("workshopOperations.publicProfile")}</h3><label>{t("workshopOperations.displayName")}<input name="displayName" defaultValue={workshop.displayName} required minLength={2} maxLength={160} /></label><label>{t("workshopOperations.descriptionLabel")}<textarea name="description" rows={4} maxLength={3000} defaultValue={workshop.description ?? ""} /></label><div className="settings-two"><label>{t("workshopOperations.phone")}<input name="publicPhone" defaultValue={workshop.publicPhone ?? ""} maxLength={40} /></label><label>{t("workshopOperations.email")}<input name="publicEmail" type="email" defaultValue={workshop.publicEmail ?? ""} maxLength={320} /></label></div><GoogleAddressSearch label={t("workshopOperations.address")} placeholder={t("home.addressSearchPlaceholder")} help={t("workspace.addressSearchHelp")} unavailable={t("workspace.addressSearchFallback")} language={language} initialAddress={workshop.address ?? ""} initialCity={workshop.city ?? ""} initialCountryCode={workshop.countryCode} initialLatitude={workshop.latitude} initialLongitude={workshop.longitude} disabled={pending} /></section>
      <section><h3>{t("workshopOperations.bookingRules")}</h3><div className="service-number-grid"><label>{t("workshopOperations.leadTime")}<input name="minimumLeadMinutes" type="number" min="0" max="43200" defaultValue={workshop.minimumLeadMinutes} required /></label><label>{t("workshopOperations.horizon")}<input name="bookingHorizonDays" type="number" min="1" max="365" defaultValue={workshop.bookingHorizonDays} required /></label><label>{t("workshopOperations.capacity")}<input name="dailyBookingCapacity" type="number" min="1" max="200" defaultValue={workshop.dailyBookingCapacity} required /></label><label>{t("workshopOperations.interval")}<select name="slotIntervalMinutes" defaultValue={workshop.slotIntervalMinutes}><option value="15">15</option><option value="30">30</option><option value="45">45</option><option value="60">60</option></select></label></div><label>{t("workshopOperations.timeZone")}<select name="timeZone" defaultValue={workshop.timeZone}><option value="Europe/Bucharest">Europe/Bucharest</option><option value="Europe/Budapest">Europe/Budapest</option><option value="Europe/Berlin">Europe/Berlin</option></select></label><div className="operations-checks"><label><input type="checkbox" name="acceptsBookingRequests" defaultChecked={workshop.acceptsBookingRequests} />{t("workshopOperations.acceptsRequests")}</label><label><input type="checkbox" name="offersPickup" defaultChecked={workshop.offersPickup} />{t("workshopOperations.pickup")}</label><label><input type="checkbox" name="offersCourtesyCar" defaultChecked={workshop.offersCourtesyCar} />{t("workshopOperations.courtesyCar")}</label><label><input type="checkbox" name="allowsWaitOnSite" defaultChecked={workshop.allowsWaitOnSite} />{t("workshopOperations.waitOnSite")}</label></div></section>
      <section><h3>{t("workshopOperations.hours")}</h3><div className="operations-hours">{workshop.operatingHours.map((hours) => <div key={hours.weekday}><strong>{t(`workshopOperations.weekday.${hours.weekday}` as TranslationKey)}</strong><label><input type="checkbox" name={`closed-${hours.weekday}`} defaultChecked={hours.closed} />{t("workshopOperations.closed")}</label><input aria-label={`${t(`workshopOperations.weekday.${hours.weekday}` as TranslationKey)} ${t("workshopOperations.opens")}`} name={`opensAt-${hours.weekday}`} type="time" defaultValue={hours.opensAt?.slice(0, 5) ?? "08:00"} /><input aria-label={`${t(`workshopOperations.weekday.${hours.weekday}` as TranslationKey)} ${t("workshopOperations.closes")}`} name={`closesAt-${hours.weekday}`} type="time" defaultValue={hours.closesAt?.slice(0, 5) ?? "17:00"} /></div>)}</div></section>
      <Result state={state} t={t} /><button disabled={pending}>{t(pending ? "workshopOperations.saving" : "workshopOperations.save")}</button>
    </form>
    <section className="operations-closures"><h3>{t("workshopOperations.closures")}</h3><p>{t("workshopOperations.closuresDescription")}</p><div>{workshop.closures.map((closure) => <RemoveClosure key={closure.id} closure={closure} language={language} t={t} />)}{!workshop.closures.length && <p>{t("workshopOperations.closure.empty")}</p>}</div><ClosureForm workshopId={workshop.id} t={t} /></section>
  </details>;
}

export default function WorkshopOperationsClient({ workshops, ownedProviders, logoutAction }: { workshops: WorkshopOperations[]; ownedProviders: OwnedProvider[]; logoutAction: () => Promise<void> }) {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  return <main className="settings-shell">
    <header className="settings-topbar"><Link href="/workshop-manager">← {t("workspace.back")}</Link><strong>pitster</strong><select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("a11y.languageSelector")}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select><form action={logoutAction}><button>{t("auth.logout")}</button></form></header>
    <section className="settings-content operations-content">
      <p className="registration-kicker">{t("workshopOperations.eyebrow")}</p><h1>{t("workshopOperations.title")}</h1><p>{t("workshopOperations.description")}</p>
      <div className="settings-accordions">
        {ownedProviders.length > 0 && <CreateLocationForm providers={ownedProviders} language={language} t={t} />}
        {workshops.map((workshop) => <WorkshopForm key={workshop.id} workshop={workshop} language={language} t={t} />)}
        {!workshops.length && <div className="catalogue-empty"><h2>{t("workshopOperations.emptyTitle")}</h2><p>{t("workshopOperations.emptyDescription")}</p></div>}
      </div>
    </section>
  </main>;
}
