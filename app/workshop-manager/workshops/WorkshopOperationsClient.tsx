"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import GoogleAddressSearch from "@/app/GoogleAddressSearch";
import { formatDateTime, translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { FieldHelp, OperationalEmptyState, OperationalIntroduction } from "@/app/guidance/OperationalGuidance";
import type { WorkshopClosure, WorkshopOperations } from "@/lib/dal/workshop-operations";
import { addWorkshopClosureAction, createWorkshopLocationAction, removeWorkshopClosureAction, updateWorkshopOperationsAction, uploadWorkshopLogoAction, type WorkshopOperationsActionState } from "./actions";
import PlatformDateTimeInput from "@/app/PlatformDateTimeInput";

const idle: WorkshopOperationsActionState = { status: "idle" };
type T = (key: TranslationKey) => string;

function Result({ state, t }: { state: WorkshopOperationsActionState; t: T }) {
  if (state.status === "idle") return null;
  return <p role="status" className={["saved", "logo_saved", "created", "location_created", "removed"].includes(state.status) ? "note-success" : "note-error"}>{t(`workshopOperations.result.${state.status}` as TranslationKey)}</p>;
}

type OwnedProvider = { id: string; displayName: string; countryCode: string };

function locationPinLabels(t: T) {
  return {
    searchMode: t("adminWorkflow.locationMode.search"),
    pinMode: t("adminWorkflow.locationMode.pin"),
    mapLabel: t("adminWorkflow.locationMode.mapLabel"),
    mapHelp: t("adminWorkflow.locationMode.mapHelp"),
    latitude: t("adminWorkflow.latitude"),
    longitude: t("adminWorkflow.longitude"),
    address: t("adminWorkflow.manualAddress"),
    city: t("adminWorkflow.nearestCity"),
    country: t("adminWorkflow.country"),
  };
}

function CreateLocationForm({ providers, language, t, portalBasePath }: { providers: OwnedProvider[]; language: Language; t: T; portalBasePath: string }) {
  const [state, action, pending] = useActionState(createWorkshopLocationAction, idle);
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [locationReady, setLocationReady] = useState(false);
  const provider = providers.find((item) => item.id === providerId) ?? providers[0];
  if (!provider) return null;
  return <details className="settings-accordion create-location-panel" id="create-location">
    <summary><span><strong>{t("workshopOperations.addLocation")}</strong><small>{t("workshopOperations.addLocationHelp")}</small></span><b>+</b></summary>
    <form className="settings-card create-location-form" action={action}>
      {providers.length > 1 ? <label>{t("workshopOperations.organisation")}<select name="serviceProviderId" value={provider.id} onChange={(event) => { setProviderId(event.target.value); setLocationReady(false); }}>{providers.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label> : <input type="hidden" name="serviceProviderId" value={provider.id} />}
      <label>{t("workshopOperations.displayName")}<input name="displayName" required minLength={2} maxLength={160} /></label>
      <div className="settings-two"><label>{t("workshopOperations.phone")}<input name="publicPhone" maxLength={40} /></label><label>{t("workshopOperations.email")}<input name="publicEmail" type="email" maxLength={320} /></label></div>
      <GoogleAddressSearch key={provider.id} label={t("workshopOperations.address")} placeholder={t("home.addressSearchPlaceholder")} help={t("workshopOperations.addressSearchHelp")} unavailable={t("workshopOperations.addressSearchUnavailable")} language={language} initialCountryCode={provider.countryCode} disabled={pending} allowManualPin manualPinLabels={locationPinLabels(t)} onSelection={(selection) => setLocationReady(Boolean(selection?.city && selection.latitude !== null && selection.longitude !== null))} />
      <p className="coverage-note">{t("workshopOperations.newLocationCoverageHelp")}</p>
      <Result state={state} t={t} />
      <button disabled={pending || !locationReady}>{t(pending ? "workshopOperations.creatingLocation" : "workshopOperations.createLocation")}</button>
      {state.status === "location_created" && <div className="create-location-next"><Link href={`${portalBasePath}${portalBasePath === "/service-organisation" ? "/managers" : "/organisation"}`}>{t("workshopOperations.assignPrimaryManager")}</Link><Link href={`${portalBasePath}${portalBasePath === "/service-organisation" ? "/billing" : "/invoicing"}`}>{t("workshopOperations.activateCoverage")}</Link></div>}
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
  return <form className="operations-closure-form" action={action}><input type="hidden" name="workshopId" value={workshopId} /><input type="hidden" name="startsAt" value={iso(startsAt)} /><input type="hidden" name="endsAt" value={iso(endsAt)} /><label>{t("workshopOperations.closure.starts")}<PlatformDateTimeInput mode="datetime-local" value={startsAt} onChange={setStartsAt} required ariaLabel={t("workshopOperations.closure.starts")} /></label><label>{t("workshopOperations.closure.ends")}<PlatformDateTimeInput mode="datetime-local" value={endsAt} onChange={setEndsAt} required ariaLabel={t("workshopOperations.closure.ends")} /></label><label>{t("workshopOperations.closure.reason")}<input name="reason" maxLength={240} /></label><Result state={state} t={t} /><button disabled={pending}>{t(pending ? "workshopOperations.saving" : "workshopOperations.closure.add")}</button></form>;
}

function LogoUploadForm({ workshop, t }: { workshop: WorkshopOperations; t: T }) {
  const [state, action, pending] = useActionState(uploadWorkshopLogoAction, idle);
  if (!workshop.logoEligible) return null;
  return <section className="workshop-logo-settings">
    <div className="workshop-logo-preview">
      {workshop.logoUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={workshop.logoUrl} alt={t("workshopOperations.logo.currentAlt")} />
        : <span aria-hidden="true">{workshop.displayName.slice(0, 1).toUpperCase()}</span>}
    </div>
    <form action={action}>
      <input type="hidden" name="workshopId" value={workshop.id} />
      <div><h3>{t("workshopOperations.logo.title")}</h3><p>{t("workshopOperations.logo.help")}</p></div>
      <label>{t("workshopOperations.logo.file")}<input name="logo" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" required /></label>
      <Result state={state} t={t} />
      <button disabled={pending}>{t(pending ? "workshopOperations.logo.uploading" : "workshopOperations.logo.upload")}</button>
    </form>
  </section>;
}

function WorkshopForm({ workshop, language, t }: { workshop: WorkshopOperations; language: Language; t: T }) {
  const [state, action, pending] = useActionState(updateWorkshopOperationsAction, idle);
  return <details className="settings-accordion operations-workshop" open><summary><span><strong>{workshop.displayName}</strong><small>{workshop.city || workshop.countryCode} · {workshop.serviceProviderName}</small></span><b>{workshop.status}</b></summary>
    <form className="settings-card operations-form" action={action}><input type="hidden" name="workshopId" value={workshop.id} />
      <section><h3>{t("workshopOperations.publicProfile")}</h3><label>{t("workshopOperations.displayName")}<input name="displayName" defaultValue={workshop.displayName} required minLength={2} maxLength={160} /></label><label>{t("workshopOperations.descriptionLabel")}<textarea name="description" rows={4} maxLength={3000} defaultValue={workshop.description ?? ""} /><FieldHelp>{t("phase3.profile.descriptionHelp")}</FieldHelp></label><div className="settings-two"><label>{t("workshopOperations.phone")}<input name="publicPhone" defaultValue={workshop.publicPhone ?? ""} maxLength={40} /></label><label>{t("workshopOperations.email")}<input name="publicEmail" type="email" defaultValue={workshop.publicEmail ?? ""} maxLength={320} /></label></div><FieldHelp>{t("phase3.profile.contactHelp")}</FieldHelp><GoogleAddressSearch label={t("workshopOperations.address")} placeholder={t("home.addressSearchPlaceholder")} help={t("workspace.addressSearchHelp")} unavailable={t("workspace.addressSearchFallback")} language={language} initialAddress={workshop.address ?? ""} initialCity={workshop.city ?? ""} initialCountryCode={workshop.countryCode} initialLatitude={workshop.latitude} initialLongitude={workshop.longitude} disabled={pending} /></section>
      <section><h3>{t("workshopOperations.bookingRules")}</h3><div className="service-number-grid"><label>{t("workshopOperations.leadTime")}<input name="minimumLeadMinutes" type="number" min="0" max="43200" defaultValue={workshop.minimumLeadMinutes} required /><FieldHelp>{t("phase3.profile.leadHelp")}</FieldHelp></label><label>{t("workshopOperations.horizon")}<input name="bookingHorizonDays" type="number" min="1" max="365" defaultValue={workshop.bookingHorizonDays} required /></label><label>{t("workshopOperations.capacity")}<input name="dailyBookingCapacity" type="number" min="1" max="200" defaultValue={workshop.dailyBookingCapacity} required /><FieldHelp>{t("phase3.profile.capacityHelp")}</FieldHelp></label><label>{t("workshopOperations.interval")}<select name="slotIntervalMinutes" defaultValue={workshop.slotIntervalMinutes}><option value="15">15</option><option value="30">30</option><option value="45">45</option><option value="60">60</option></select></label></div><label>{t("workshopOperations.timeZone")}<select name="timeZone" defaultValue={workshop.timeZone}><option value="Europe/Bucharest">Europe/Bucharest</option><option value="Europe/Budapest">Europe/Budapest</option><option value="Europe/Berlin">Europe/Berlin</option></select></label><div className="operations-checks"><label><input type="checkbox" name="acceptsBookingRequests" defaultChecked={workshop.acceptsBookingRequests} />{t("workshopOperations.acceptsRequests")}</label><label><input type="checkbox" name="offersPickup" defaultChecked={workshop.offersPickup} />{t("workshopOperations.pickup")}</label><label><input type="checkbox" name="offersCourtesyCar" defaultChecked={workshop.offersCourtesyCar} />{t("workshopOperations.courtesyCar")}</label><label><input type="checkbox" name="allowsWaitOnSite" defaultChecked={workshop.allowsWaitOnSite} />{t("workshopOperations.waitOnSite")}</label></div></section>
      <section><h3>{t("workshopOperations.hours")}</h3><FieldHelp>{t("phase3.profile.hoursHelp")}</FieldHelp><div className="operations-hours">{workshop.operatingHours.map((hours) => <div key={hours.weekday}><strong>{t(`workshopOperations.weekday.${hours.weekday}` as TranslationKey)}</strong><label><input type="checkbox" name={`closed-${hours.weekday}`} defaultChecked={hours.closed} />{t("workshopOperations.closed")}</label><PlatformDateTimeInput mode="time" name={`opensAt-${hours.weekday}`} defaultValue={hours.opensAt?.slice(0, 5) ?? "08:00"} step={900} ariaLabel={`${t(`workshopOperations.weekday.${hours.weekday}` as TranslationKey)} ${t("workshopOperations.opens")}`} /><PlatformDateTimeInput mode="time" name={`closesAt-${hours.weekday}`} defaultValue={hours.closesAt?.slice(0, 5) ?? "17:00"} step={900} ariaLabel={`${t(`workshopOperations.weekday.${hours.weekday}` as TranslationKey)} ${t("workshopOperations.closes")}`} /></div>)}</div></section>
      <Result state={state} t={t} /><button disabled={pending}>{t(pending ? "workshopOperations.saving" : "workshopOperations.save")}</button>
    </form>
    <LogoUploadForm workshop={workshop} t={t} />
    <section className="operations-closures"><h3>{t("workshopOperations.closures")}</h3><p>{t("workshopOperations.closuresDescription")}</p><div>{workshop.closures.map((closure) => <RemoveClosure key={closure.id} closure={closure} language={language} t={t} />)}{!workshop.closures.length && <p>{t("workshopOperations.closure.empty")}</p>}</div><ClosureForm workshopId={workshop.id} t={t} /></section>
  </details>;
}

export default function WorkshopOperationsClient({ workshops, ownedProviders, logoutAction, portalBasePath = "/workshop-manager" }: { workshops: WorkshopOperations[]; ownedProviders: OwnedProvider[]; logoutAction: () => Promise<void>; portalBasePath?: string }) {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  return <main className="settings-shell">
    <header className="settings-topbar"><Link href={portalBasePath}>← {t("workspace.back")}</Link><strong>pitster</strong><select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("a11y.languageSelector")}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select><form action={logoutAction}><button>{t("auth.logout")}</button></form></header>
    <section className="settings-content operations-content">
      <p className="registration-kicker">{t("workshopOperations.eyebrow")}</p><h1>{t("workshopOperations.title")}</h1><p>{t("workshopOperations.description")}</p>
      <OperationalIntroduction title={t("operationalGuidance.howTitle")} description={t("phase3.profile.intro")} outcomeLabel={t("operationalGuidance.whyLabel")} outcome={t("phase3.profile.outcome")} stepsLabel={t("operationalGuidance.stepsLabel")} steps={[t("phase3.profile.step1"), t("phase3.profile.step2"), t("phase3.profile.step3")]} />
      <div className="settings-accordions">
        {ownedProviders.length > 0 && <CreateLocationForm providers={ownedProviders} language={language} t={t} portalBasePath={portalBasePath} />}
        {workshops.map((workshop) => <WorkshopForm key={workshop.id} workshop={workshop} language={language} t={t} />)}
        {!workshops.length && <OperationalEmptyState mark="W" title={t("workshopOperations.emptyTitle")} description={t("workshopOperations.emptyDescription")} action={ownedProviders.length ? <a href="#create-location">+ {t("workshopOperations.addLocation")}</a> : undefined} />}
      </div>
    </section>
  </main>;
}
