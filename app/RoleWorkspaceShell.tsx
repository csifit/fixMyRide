"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { SidebarIdentity } from "@/lib/dal/sidebar-identity";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import RoleGuidance from "@/app/guidance/RoleGuidance";
import { guidanceFor } from "@/app/guidance/content";
import type { GuidanceRole } from "@/lib/dal/guidance";

type Role = "customer" | "workshop_manager" | "workshop_staff" | "service_provider" | "service_organisation";
type Item = { href: string; key: TranslationKey; mark: string };

const navigation: Record<Role, { titleKey: TranslationKey; items: Item[] }> = {
  customer: { titleKey: "roleSidebar.customer", items: [
    { href: "/garage", key: "roleSidebar.nav.myGarage", mark: "G" },
    { href: "/customer/bookings", key: "roleSidebar.nav.bookings", mark: "B" },
    { href: "/workshops", key: "roleSidebar.nav.findWorkshops", mark: "F" },
  ] },
  workshop_manager: { titleKey: "roleSidebar.workshopManager", items: [
    { href: "/workshop-manager", key: "roleSidebar.nav.overview", mark: "O" },
    { href: "/workshop-manager/requests", key: "roleSidebar.nav.calendarRequests", mark: "C" },
    { href: "/workshop-manager/repairs", key: "roleSidebar.nav.repairLifecycle", mark: "R" },
    { href: "/workshop-manager/quality", key: "roleSidebar.nav.qualityReminders", mark: "Q" },
    { href: "/workshop-manager/workshops", key: "roleSidebar.nav.workshops", mark: "W" },
    { href: "/workshop-manager/services", key: "roleSidebar.nav.serviceCatalogue", mark: "S" },
    { href: "/workshop-manager/inventory", key: "roleSidebar.nav.partsConsumables", mark: "I" },
  ] },
  service_organisation: { titleKey: "roleSidebar.serviceOrganisation", items: [
    { href: "/service-organisation", key: "roleSidebar.nav.overview", mark: "O" },
    { href: "/service-organisation/requests", key: "roleSidebar.nav.calendarRequests", mark: "C" },
    { href: "/service-organisation/repairs", key: "roleSidebar.nav.repairLifecycle", mark: "R" },
    { href: "/service-organisation/quality", key: "roleSidebar.nav.qualityReminders", mark: "Q" },
    { href: "/service-organisation/locations", key: "roleSidebar.nav.locations", mark: "L" },
    { href: "/service-organisation/services", key: "roleSidebar.nav.serviceCatalogue", mark: "S" },
    { href: "/service-organisation/managers", key: "roleSidebar.nav.workshopManagers", mark: "M" },
    { href: "/service-organisation/inventory", key: "roleSidebar.nav.partsConsumables", mark: "I" },
    { href: "/service-organisation/billing", key: "roleSidebar.nav.subscriptionBilling", mark: "$" },
  ] },
  workshop_staff: { titleKey: "roleSidebar.workshopStaff", items: [
    { href: "/workshop-staff", key: "roleSidebar.nav.operations", mark: "O" },
  ] },
  service_provider: { titleKey: "roleSidebar.serviceProvider", items: [
    { href: "/service-provider", key: "roleSidebar.nav.overview", mark: "O" },
    { href: "/workshops", key: "roleSidebar.nav.publicWorkshops", mark: "W" },
  ] },
};

export default function RoleWorkspaceShell({ role, identity, dismissedGuides = [], children }: { role: Role; identity: SidebarIdentity | null; dismissedGuides?: string[]; children: ReactNode }) {
  const pathname = usePathname();
  const [language] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  const storageKey = `pitster.sidebar.${role}`;
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = localStorage.getItem(storageKey);
      setCollapsed(saved ? saved === "collapsed" : window.matchMedia("(max-width: 760px)").matches);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [storageKey]);
  if (pathname.includes("/login")) return children;
  const nav = navigation[role];
  const toggle = () => setCollapsed((current) => {
    const next = !current;
    localStorage.setItem(storageKey, next ? "collapsed" : "expanded");
    return next;
  });
  return <div className={`role-workspace${collapsed ? " sidebar-collapsed" : ""}`}>
    <aside className="role-sidebar">
      <header><Link href="/" aria-label="pitster home"><b>p</b><strong>pitster</strong></Link><button type="button" onClick={toggle} aria-label={t(collapsed ? "roleSidebar.expand" : "roleSidebar.collapse")}>{collapsed ? ">" : "<"}</button></header>
      <small>{t(nav.titleKey)}</small>
      {identity && <div className="role-sidebar-identity"><strong title={identity.displayName}>{identity.displayName}</strong><span title={identity.email}>{identity.email}</span></div>}
      <nav aria-label={`${t(nav.titleKey)} ${t("roleSidebar.navigation")}`}>{nav.items.map((item) => {
        const active = pathname === item.href || (item.href !== `/${role.replace("_", "-")}` && pathname.startsWith(`${item.href}/`));
        return <Link key={item.href} href={item.href} className={active ? "active" : ""} title={collapsed ? t(item.key) : undefined}><b>{item.mark}</b><span>{t(item.key)}</span></Link>;
      })}</nav>
    </aside>
    <div className="role-workspace-content">
      {(role === "workshop_manager" || role === "service_organisation") && <RoleGuidance
        key={`${role}:${pathname}`}
        role={role as GuidanceRole}
        pathname={pathname}
        language={language}
        initiallyDismissed={dismissedGuides.includes(guidanceForKey(role as GuidanceRole, pathname))}
      />}
      {children}
    </div>
  </div>;
}

function guidanceForKey(role: GuidanceRole, pathname: string) {
  const guide = guidanceFor(role, pathname, "en");
  return guide?.key ?? "";
}
