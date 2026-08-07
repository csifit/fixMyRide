"use client";

import Link from "next/link";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { ManagedServiceProvider } from "@/lib/dal/service-providers";

export default function WorkshopManagerDashboard({ displayName, providers, logoutAction }: { displayName: string; providers: ManagedServiceProvider[]; logoutAction: () => Promise<void> }) {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  return <main className="organization-shell"><header className="organization-topbar"><strong>pitster</strong><select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label={t("a11y.languageSelector")}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select><form action={logoutAction}><button>{t("auth.logout")}</button></form></header>
    <section className="organization-content"><p className="registration-kicker">{t("managerPortal.eyebrow")}</p><h1>{t("managerPortal.welcome").replace("{name}", displayName)}</h1><p>{t("managerPortal.description")}</p>
      <nav className="manager-portal-links"><Link className="organization-action" href="/workshop-manager/requests">{t("workshopBookings.title")}</Link><Link className="organization-action" href="/workshop-manager/repairs">{t("repairLifecycle.title")}</Link><Link className="organization-action" href="/workshop-manager/workshops">{t("managerPortal.workshops")}</Link><Link className="organization-action" href="/workshop-manager/services">{t("serviceCatalogue.title")}</Link><Link className="organization-action" href="/workshop-manager/invoicing">{t("invoicing.title")}</Link></nav>
      {providers.map((provider) => <article className="organization-card" key={provider.id}><header><div><h2>{provider.displayName}</h2><p>{provider.legalName} · {provider.countryCode}</p></div><b>{provider.status}</b></header><dl><div><dt>{t("managerPortal.role")}</dt><dd>{provider.membershipRole}</dd></div><div><dt>{t("managerPortal.workshops")}</dt><dd>{provider.workshops.length}</dd></div></dl>{provider.workshops.map((workshop) => <div className="organization-row" key={workshop.id}><span><strong>{workshop.displayName}</strong><small>{workshop.city || provider.countryCode}</small></span><b>{workshop.status}</b></div>)}</article>)}
      {!providers.length && <p className="organization-card">{t("managerPortal.empty")}</p>}
    </section>
  </main>;
}
