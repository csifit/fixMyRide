"use client";

import Link from "next/link";
import { formatDateTime, translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import {
  administratorRoleKey,
  administratorStatusKey,
  clinicianSpecialtyKey,
  clinicianStatusKey,
} from "@/app/i18n/admin-values";
import { brand } from "@/lib/brand";
import type { AdminDashboardData, AdminSection } from "@/lib/dal/admin";
import PendingSubmitButton from "@/app/PendingSubmitButton";
import { adminLogoutAction, setAccountingAccessAction } from "./actions";

type NavItem = {
  id: AdminSection | "invoicing";
  href: string;
  key: TranslationKey;
  count?: number;
};

export default function AdminDashboard({
  data,
  section = "attention",
}: {
  data: AdminDashboardData;
  section?: AdminSection;
}) {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  const nav: NavItem[] = [
    { id: "attention", href: "/admin", key: "admin.nav.attention", count: data.counts.attention },
    { id: "doctors", href: "/admin/doctors", key: "admin.nav.doctors", count: data.counts.doctors },
    { id: "clinics", href: "/admin/clinics", key: "admin.nav.clinics", count: data.counts.clinics },
    { id: "patients", href: "/admin/patients", key: "admin.nav.patients", count: data.counts.patients },
    { id: "organizations", href: "/admin/organizations", key: "admin.nav.organizations", count: data.counts.clinicManagers },
    { id: "managers", href: "/admin/managers", key: "admin.nav.managers", count: data.counts.platformManagers },
    { id: "specialties", href: "/admin/specialties", key: "admin.nav.specialties" },
    { id: "reviews", href: "/admin/reviews", key: "admin.nav.reviews" },
    { id: "sms", href: "/admin/sms", key: "admin.nav.sms" },
    { id: "contracts", href: "/admin/contracts", key: "admin.nav.contracts" },
    { id: "privacy", href: "/admin/privacy", key: "admin.nav.privacy" },
    { id: "invoicing", href: "/admin/invoicing", key: "admin.nav.invoicing" },
    { id: "security", href: "/admin/security", key: "admin.nav.security" },
  ];

  return (
    <main className={`admin-shell ${ready ? "" : "i18n-pending"}`}>
      <aside className="admin-sidebar">
        <Link href="/" className="admin-brand">
          <span>+</span><strong>{brand.name}</strong>
        </Link>
        <p>{t("admin.brand.console")}</p>
        <nav aria-label={t("admin.nav.label")}>
          {nav.map((item) => (
            <Link key={item.id} href={item.href} className={section === item.id ? "active" : ""}>
              <span>{t(item.key)}</span>
              {typeof item.count === "number" && <b>{item.count}</b>}
            </Link>
          ))}
        </nav>
        <div className="admin-identity">
          <strong>{data.administrator.displayName}</strong>
          <small>{t(administratorRoleKey(data.administrator.role))} · AAL2</small>
          <form action={adminLogoutAction}>
            <PendingSubmitButton type="submit">{t("auth.logout")}</PendingSubmitButton>
          </form>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div><small>{t("admin.security.session")}</small><strong>{t("admin.security.aal2")}</strong></div>
          <label className="language">
            <span aria-hidden="true">◎</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label={t("a11y.languageSelector")}>
              <option value="en">{t("language.en")}</option><option value="de">{t("language.de")}</option>
              <option value="ro">{t("language.ro")}</option><option value="hu">{t("language.hu")}</option>
            </select>
          </label>
        </header>
        <div className="admin-content">
          <div className="admin-title">
            <div><p>{t("admin.dashboard.eyebrow")}</p><h1>{t(`admin.section.${section}.title` as TranslationKey)}</h1><span>{t(`admin.section.${section}.description` as TranslationKey)}</span></div>
            <small>{t("admin.dashboard.generated")} {formatDateTime(language, data.generatedAt)}</small>
          </div>

          {section === "attention" && <AttentionView data={data} t={t} language={language} />}
          {section === "doctors" && <AdminTable headers={[t("admin.table.name"), t("admin.table.specialty"), t("admin.table.clinic"), t("admin.table.identifier"), t("admin.table.status")]} rows={data.clinicians.map((row) => [row.fullName, t(clinicianSpecialtyKey(row.specialty)), row.clinicName, row.professionalIdentifier, t(clinicianStatusKey(row.status))])} empty={t("admin.empty.doctors")} />}
          {section === "patients" && <AdminTable headers={[t("admin.table.name"), t("admin.table.vitapassId"), t("admin.table.status"), t("admin.table.created")]} rows={data.patients.map((row) => [row.fullName, row.vitapassId, t(row.archived ? "admin.status.archived" : "admin.status.current"), formatDateTime(language, row.createdAt)])} empty={t("admin.empty.patients")} />}
          {section === "clinics" && <AdminTable headers={[t("admin.table.name"), t("admin.table.location"), t("admin.table.doctors"), t("admin.table.status")]} rows={data.clinics.map((row) => [row.displayName, [row.address, row.city, row.countryCode].filter(Boolean).join(", "), String(row.doctorCount), t(administratorStatusKey(row.status))])} empty={t("admin.empty.clinics")} />}
          {section === "organizations" && <AdminTable headers={[t("admin.table.name"), t("admin.table.clinics"), t("admin.table.status"), t("admin.table.created")]} rows={data.clinicManagers.map((row) => [row.displayName, String(row.clinicCount), t(administratorStatusKey(row.status)), formatDateTime(language, row.createdAt)])} empty={t("admin.empty.organizations")} />}
          {section === "managers" && <ManagersView data={data} t={t} language={language} />}
          {(["specialties", "reviews", "sms", "contracts", "privacy", "security"] as AdminSection[]).includes(section) && <PlannedView t={t} />}
        </div>
      </section>
    </main>
  );
}

function AttentionView({ data, t, language }: { data: AdminDashboardData; t: (key: TranslationKey) => string; language: "en" | "de" | "ro" | "hu" }) {
  const metrics = [
    ["admin.nav.doctors", data.counts.doctors], ["admin.nav.clinics", data.counts.clinics],
    ["admin.nav.patients", data.counts.patients], ["admin.nav.organizations", data.counts.clinicManagers],
  ] as Array<[TranslationKey, number]>;
  return <>
    <div className="admin-metrics">{metrics.map(([key, value]) => <article key={key}><strong>{value}</strong><span>{t(key)}</span></article>)}</div>
    <div className="admin-attention-card">
      <header><div><h2>{t("admin.attention.title")}</h2><p>{t("admin.attention.description")}</p></div><b>{data.tasks.length}</b></header>
      {data.tasks.length ? <div className="admin-task-list">{data.tasks.map((task) => <article key={`${task.kind}-${task.id}`}>
        <i className={task.priority}>{task.priority === "high" ? "!" : "·"}</i>
        <div><strong>{t(`admin.task.${task.kind}` as TranslationKey)}</strong><span>{task.title}</span><small>{task.detail} · {formatDateTime(language, task.createdAt)}</small></div>
        <Link href={task.href}>{t("admin.attention.open")}</Link>
      </article>)}</div> : <p className="admin-empty">{t("admin.attention.empty")}</p>}
    </div>
  </>;
}

function ManagersView({ data, t, language }: { data: AdminDashboardData; t: (key: TranslationKey) => string; language: "en" | "de" | "ro" | "hu" }) {
  return <><AdminTable headers={[t("admin.table.name"), t("admin.table.role"), t("admin.table.accounting"), t("admin.table.status"), t("admin.table.created")]} rows={data.administrators.map((row) => [row.displayName, t(administratorRoleKey(row.role)), t(row.accountingAccess ? "billing.accessEnabled" : "billing.accessDisabled"), t(administratorStatusKey(row.status)), formatDateTime(language, row.createdAt)])} empty={t("admin.empty.users")} />
    {data.administrator.role === "superadmin" && <div className="admin-accounting-access"><h2>{t("billing.accountingAccess")}</h2><p>{t("billing.accountingAccessHelp")}</p>{data.administrators.filter((row) => row.role === "manager").map((row) => <form action={setAccountingAccessAction} key={row.id}><input type="hidden" name="administratorId" value={row.id} /><span><strong>{row.displayName}</strong><small>{t(administratorRoleKey(row.role))}</small></span><input type="hidden" name="enabled" value={String(!row.accountingAccess)} /><b>{t(row.accountingAccess ? "billing.accessEnabled" : "billing.accessDisabled")}</b><button>{t(row.accountingAccess ? "billing.removeAccess" : "billing.grantAccess")}</button></form>)}</div>}
  </>;
}

function PlannedView({ t }: { t: (key: TranslationKey) => string }) {
  return <div className="admin-planned"><span>→</span><h2>{t("admin.planned.title")}</h2><p>{t("admin.planned.description")}</p></div>;
}

function AdminTable({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) {
  return <div className="admin-table-card">{rows.length ? <div className="admin-table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={`${row[0]}-${rowIndex}`}>{row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`}>{cell || "—"}</td>)}</tr>)}</tbody></table></div> : <p className="admin-empty">{empty}</p>}</div>;
}
