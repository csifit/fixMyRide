"use client";

import Link from "next/link";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { ManagedServiceProvider } from "@/lib/dal/service-providers";

export default function ServiceOrganisationDashboard({ displayName, providers, lowStockCount, logoutAction }: {
  displayName: string;
  providers: ManagedServiceProvider[];
  lowStockCount: number;
  logoutAction: () => Promise<void>;
}) {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  return <main className="organization-shell">
    <header className="organization-topbar"><strong>pitster</strong><select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label={t("a11y.languageSelector")}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select><form action={logoutAction}><button>{t("auth.logout")}</button></form></header>
    <section className="organization-content">
      <p className="registration-kicker">{t("serviceOrganisationPortal.eyebrow")}</p>
      <h1>{t("serviceOrganisationPortal.welcome").replace("{name}", displayName)}</h1>
      <p>{t("serviceOrganisationPortal.description")}</p>
      {lowStockCount > 0 && <Link className="dashboard-stock-warning" href="/service-organisation/inventory"><strong>{t("inventory.attentionTitle")}</strong><span>{t("inventory.attentionDescription")} ({lowStockCount})</span></Link>}
      <nav className="manager-portal-links">
        <Link className="organization-action" href="/service-organisation/locations">{t("serviceOrganisationPortal.locations")}</Link>
        <Link className="organization-action" href="/service-organisation/managers">{t("serviceOrganisationPortal.managers")}</Link>
        <Link className="organization-action" href="/service-organisation/billing">{t("serviceOrganisationPortal.billing")}</Link>
        <Link className="organization-action" href="/service-organisation/inventory">{t("inventory.title")}</Link>
      </nav>
      {providers.map((provider) => <article className="organization-card" key={provider.id}><header><div><h2>{provider.displayName}</h2><p>{provider.legalName} · {provider.countryCode}</p></div><b>{provider.status}</b></header><dl><div><dt>{t("serviceOrganisationPortal.accountRole")}</dt><dd>{t("serviceOrganisationPortal.owner")}</dd></div><div><dt>{t("serviceOrganisationPortal.locations")}</dt><dd>{provider.workshops.length}</dd></div></dl></article>)}
    </section>
  </main>;
}
