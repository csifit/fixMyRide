"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { SidebarIdentity } from "@/lib/dal/sidebar-identity";

type Role = "customer" | "workshop_manager" | "workshop_staff" | "service_provider" | "service_organisation";
type Item = { href: string; label: string; mark: string };

const navigation: Record<Role, { title: string; items: Item[] }> = {
  customer: { title: "Customer", items: [
    { href: "/garage", label: "My Garage", mark: "G" },
    { href: "/customer/bookings", label: "Bookings", mark: "B" },
    { href: "/workshops", label: "Find workshops", mark: "F" },
  ] },
  workshop_manager: { title: "Workshop manager", items: [
    { href: "/workshop-manager", label: "Overview", mark: "O" },
    { href: "/workshop-manager/requests", label: "Calendar & requests", mark: "C" },
    { href: "/workshop-manager/repairs", label: "Repair lifecycle", mark: "R" },
    { href: "/workshop-manager/quality", label: "Quality & reminders", mark: "Q" },
    { href: "/workshop-manager/workshops", label: "Workshops", mark: "W" },
    { href: "/workshop-manager/services", label: "Service catalogue", mark: "S" },
    { href: "/workshop-manager/inventory", label: "Parts & consumables", mark: "I" },
  ] },
  service_organisation: { title: "Service organisation", items: [
    { href: "/service-organisation", label: "Overview", mark: "O" },
    { href: "/service-organisation/locations", label: "Locations", mark: "L" },
    { href: "/service-organisation/managers", label: "Workshop managers", mark: "M" },
    { href: "/service-organisation/inventory", label: "Parts & consumables", mark: "I" },
    { href: "/service-organisation/billing", label: "Subscription & billing", mark: "$" },
  ] },
  workshop_staff: { title: "Workshop staff", items: [
    { href: "/workshop-staff", label: "Operations", mark: "O" },
  ] },
  service_provider: { title: "Service provider", items: [
    { href: "/service-provider", label: "Overview", mark: "O" },
    { href: "/workshops", label: "Public workshops", mark: "W" },
  ] },
};

export default function RoleWorkspaceShell({ role, identity, children }: { role: Role; identity: SidebarIdentity | null; children: ReactNode }) {
  const pathname = usePathname();
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
      <header><Link href="/" aria-label="pitster home"><b>p</b><strong>pitster</strong></Link><button type="button" onClick={toggle} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>{collapsed ? ">" : "<"}</button></header>
      <small>{nav.title}</small>
      {identity && <div className="role-sidebar-identity"><strong title={identity.displayName}>{identity.displayName}</strong><span title={identity.email}>{identity.email}</span></div>}
      <nav aria-label={`${nav.title} navigation`}>{nav.items.map((item) => {
        const active = pathname === item.href || (item.href !== `/${role.replace("_", "-")}` && pathname.startsWith(`${item.href}/`));
        return <Link key={item.href} href={item.href} className={active ? "active" : ""} title={collapsed ? item.label : undefined}><b>{item.mark}</b><span>{item.label}</span></Link>;
      })}</nav>
    </aside>
    <div className="role-workspace-content">{children}</div>
  </div>;
}
