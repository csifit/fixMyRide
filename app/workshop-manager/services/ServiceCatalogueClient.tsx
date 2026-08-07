"use client";

// Canonical workshop-manager catalogue UI.

import Link from "next/link";
import { useActionState, useState } from "react";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { ManagedWorkshopCatalogue, ManagedWorkshopService } from "@/lib/dal/workshop-services";
import { standardServiceCategories, standardServiceTemplates, vehicleTypes, type StandardServiceTemplate } from "@/lib/automotive-service-catalogue";
import {
  createServiceAction,
  setServiceActiveAction,
  updateServiceAction,
  type ServiceCatalogueState,
} from "./actions";

const initial: ServiceCatalogueState = { status: "idle" };
type Translate = (key: TranslationKey) => string;

function Result({ state, t }: { state: ServiceCatalogueState; t: Translate }) {
  if (state.status === "idle") return null;
  const success = ["saved", "created", "published", "archived"].includes(state.status);
  return <p className={success ? "note-success" : "note-error"} role="status">{t(`serviceCatalogue.status.${state.status}` as TranslationKey)}</p>;
}

function ServiceFields({ service, preset, t }: { service?: ManagedWorkshopService; preset?: StandardServiceTemplate; t: Translate }) {
  return <>
    <input type="hidden" name="serviceCode" value={service?.serviceCode ?? preset?.code ?? ""} />
    <div className="settings-two"><label>{t("serviceCatalogue.name")}<input name="name" defaultValue={service?.name ?? preset?.name} list="standard-service-options" minLength={2} maxLength={160} required readOnly={service?.serviceCode === "diagnosis"} /></label><label>{t("serviceCatalogue.category")}<input name="category" defaultValue={service?.category ?? preset?.category} list="service-categories" minLength={2} maxLength={80} required /></label></div>
    <label>{t("serviceCatalogue.serviceDescription")}<textarea name="description" defaultValue={service?.description ?? ""} rows={3} maxLength={1000} /></label>
    <div className="settings-two">
      <label>{t("serviceCatalogue.vehicleType")}<select name="vehicleType" defaultValue={service?.vehicleType ?? preset?.vehicleType ?? "car_van"}>{vehicleTypes.map((type) => <option key={type} value={type}>{t(`serviceCatalogue.vehicleType.${type}` as TranslationKey)}</option>)}</select></label>
      <label>{t("serviceCatalogue.bookingMode")}<select name="bookingMode" defaultValue={service?.bookingMode ?? preset?.bookingMode ?? "direct"} disabled={service?.serviceCode === "diagnosis"}><option value="direct">{t("serviceCatalogue.bookingMode.direct")}</option><option value="diagnosis_first">{t("serviceCatalogue.bookingMode.diagnosis_first")}</option><option value="diagnosis">{t("serviceCatalogue.bookingMode.diagnosis")}</option></select>{service?.serviceCode === "diagnosis" && <input type="hidden" name="bookingMode" value="diagnosis" />}</label>
    </div>
    <div className="service-number-grid">
      <label>{t("serviceCatalogue.duration")}<input name="estimatedDurationMinutes" type="number" min={15} max={2880} step={15} defaultValue={service?.estimatedDurationMinutes ?? ""} /></label>
      <label>{t("serviceCatalogue.priceFrom")}<input name="price" inputMode="decimal" placeholder="49.90" defaultValue={service?.priceFromCents === null || service?.priceFromCents === undefined ? "" : (service.priceFromCents / 100).toFixed(2)} /></label>
      <label>{t("serviceCatalogue.currency")}<input name="currency" defaultValue={service?.currency ?? "EUR"} minLength={3} maxLength={3} required /></label>
      {service && <label>{t("serviceCatalogue.displayOrder")}<input name="displayOrder" type="number" min={0} max={10000} defaultValue={service.displayOrder} required /></label>}
    </div>
    {service?.serviceCode === "diagnosis" && <p className="catalogue-diagnosis-note">{t("serviceCatalogue.diagnosisFeeHelp")}</p>}
  </>;
}

function ServiceEditor({ service, t }: { service: ManagedWorkshopService; t: Translate }) {
  const [state, action, pending] = useActionState(updateServiceAction, initial);
  const [activeState, activeAction, activePending] = useActionState(setServiceActiveAction, initial);
  return <details className={`settings-accordion service-editor${service.active ? "" : " archived"}`}>
    <summary><span><strong>{service.name}</strong><small>{service.category} · {service.priceFromCents === null ? t("serviceCatalogue.priceReview") : `${(service.priceFromCents / 100).toFixed(2)} ${service.currency}`}</small></span><b>{service.serviceCode === "diagnosis" && !service.active ? t("serviceCatalogue.setupRequired") : t(service.active ? "serviceCatalogue.published" : "serviceCatalogue.archived")}</b></summary>
    <form className="settings-card" action={action}>
      <input type="hidden" name="serviceId" value={service.id} />
      <fieldset disabled={pending}><ServiceFields service={service} t={t} /></fieldset>
      <Result state={state} t={t} /><button disabled={pending}>{t(pending ? "workspace.saving" : "workspace.save")}</button>
    </form>
    <form className="service-archive-form" action={activeAction}>
      <input type="hidden" name="serviceId" value={service.id} /><input type="hidden" name="active" value={String(!service.active)} />
      <Result state={activeState} t={t} /><button disabled={activePending}>{t(service.active ? "serviceCatalogue.archiveAction" : "serviceCatalogue.publishAction")}</button>
    </form>
  </details>;
}

function WorkshopCatalogue({ catalogue, t }: { catalogue: ManagedWorkshopCatalogue; t: Translate }) {
  const [state, action, pending] = useActionState(createServiceAction, initial);
  const [templateCode, setTemplateCode] = useState("");
  const preset = standardServiceTemplates.find((service) => `${service.vehicleType}:${service.code}` === templateCode);
  return <section className="catalogue-workshop">
    <header><div><p>{t("serviceCatalogue.workshop")}</p><h2>{catalogue.workshopName}</h2></div><span>{catalogue.services.filter((service) => service.active).length} {t("serviceCatalogue.publishedCount")}</span></header>
    <div className="settings-accordions">
      {catalogue.services.map((service) => <ServiceEditor key={service.id} service={service} t={t} />)}
      {!catalogue.services.length && <div className="catalogue-empty"><h3>{t("serviceCatalogue.emptyTitle")}</h3><p>{t("serviceCatalogue.emptyDescription")}</p></div>}
    </div>
    <details className="settings-accordion catalogue-add">
      <summary><strong>+ {t("serviceCatalogue.addService")}</strong></summary>
      <form className="settings-card" action={action}>
        <input type="hidden" name="serviceProviderId" value={catalogue.serviceProviderId} />
        <label>{t("serviceCatalogue.template")}<select value={templateCode} onChange={(event) => setTemplateCode(event.target.value)}><option value="">{t("serviceCatalogue.template.custom")}</option>{standardServiceTemplates.filter((service) => service.code !== "diagnosis").map((service) => <option key={`${service.vehicleType}:${service.code}`} value={`${service.vehicleType}:${service.code}`}>{service.name} · {t(`serviceCatalogue.vehicleType.${service.vehicleType}` as TranslationKey)}</option>)}</select></label>
        <fieldset disabled={pending}><ServiceFields key={templateCode} preset={preset} t={t} /></fieldset>
        <Result state={state} t={t} /><button disabled={pending}>{t(pending ? "serviceCatalogue.adding" : "serviceCatalogue.addService")}</button>
      </form>
    </details>
  </section>;
}

export default function ServiceCatalogueClient({ catalogues, logoutAction }: { catalogues: ManagedWorkshopCatalogue[]; logoutAction: () => Promise<void> }) {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  return <main className="settings-shell">
    <datalist id="service-categories">{standardServiceCategories.map((category) => <option key={category} value={category} />)}</datalist>
    <datalist id="standard-service-options">{standardServiceTemplates.filter((service) => service.code !== "diagnosis").map((service) => <option key={`${service.vehicleType}-${service.code}`} value={service.name}>{service.category}</option>)}</datalist>
    <header className="settings-topbar"><Link href="/workshop-manager">← {t("workspace.back")}</Link><strong>pitster</strong><select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label={t("a11y.languageSelector")}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select><form action={logoutAction}><button>{t("auth.logout")}</button></form></header>
    <section className="settings-content catalogue-content"><p className="registration-kicker">{t("serviceCatalogue.eyebrow")}</p><h1>{t("serviceCatalogue.title")}</h1><p>{t("serviceCatalogue.description")}</p>
      {catalogues.map((catalogue) => <WorkshopCatalogue key={catalogue.workshopId} catalogue={catalogue} t={t} />)}
      {!catalogues.length && <div className="catalogue-empty"><h2>{t("serviceCatalogue.noWorkshopTitle")}</h2><p>{t("serviceCatalogue.noWorkshopDescription")}</p><Link className="organization-action" href="/workshop-manager/workshops">{t("serviceCatalogue.manageWorkshops")}</Link></div>}
    </section>
  </main>;
}
