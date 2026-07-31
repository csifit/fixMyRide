"use client";

import { useState } from "react";
import Link from "next/link";
import {
  formatDateTime,
  translate,
  type TranslationKey,
} from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import {
  administratorRoleKey,
  administratorStatusKey,
  auditActionKey,
  auditResourceKey,
  clinicianSpecialtyKey,
  clinicianStatusKey,
  grantStatusKey,
} from "@/app/i18n/admin-values";
import type { AdminDashboardData } from "@/lib/dal/admin";
import { adminLogoutAction, setAccountingAccessAction } from "./actions";
import PendingSubmitButton from "@/app/PendingSubmitButton";

type Section = "users" | "doctors" | "patients" | "grants" | "audit";

export default function AdminDashboard({
  data,
}: {
  data: AdminDashboardData;
}) {
  const [language, setLanguage, ready] = useLanguage();
  const [section, setSection] = useState<Section>("users");
  const t = (key: TranslationKey) => translate(language, key);
  const sections: Array<{
    id: Section;
    key: TranslationKey;
    count: number;
  }> = [
    { id: "users", key: "admin.nav.users", count: data.administrators.length },
    { id: "doctors", key: "admin.nav.doctors", count: data.clinicians.length },
    { id: "patients", key: "admin.nav.patients", count: data.patients.length },
    { id: "grants", key: "admin.nav.grants", count: data.grants.length },
    { id: "audit", key: "admin.nav.audit", count: data.auditEvents.length },
  ];

  return (
    <main className={`admin-shell ${ready ? "" : "i18n-pending"}`}>
      <aside className="admin-sidebar">
        <Link href="/" className="admin-brand">
          <span>+</span>
          <strong>VitaPass</strong>
        </Link>
        <p>{t("admin.brand.console")}</p>
        <nav aria-label={t("admin.nav.label")}>
          {sections.map((item) => (
            <button
              key={item.id}
              className={section === item.id ? "active" : ""}
              onClick={() => setSection(item.id)}
            >
              <span>{t(item.key)}</span>
              <b>{item.count}</b>
            </button>
          ))}
        </nav>
        <Link className="admin-accounting-link" href="/admin/invoicing">{t("invoicing.title")}</Link>
        <div className="admin-identity">
          <strong>{data.administrator.displayName}</strong>
          <small>{t("admin.role.superadmin")} · AAL2</small>
          <form action={adminLogoutAction}>
            <PendingSubmitButton type="submit">
              {t("auth.logout")}
            </PendingSubmitButton>
          </form>
        </div>
      </aside>
      <section className="admin-main">
        <header className="admin-topbar">
          <div>
            <small>{t("admin.security.session")}</small>
            <strong>{t("admin.security.aal2")}</strong>
          </div>
          <label className="language">
            <span aria-hidden="true">◎</span>
            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as typeof language)
              }
              aria-label={t("a11y.languageSelector")}
            >
              <option value="en">{t("language.en")}</option>
              <option value="de">{t("language.de")}</option>
              <option value="ro">{t("language.ro")}</option>
              <option value="hu">{t("language.hu")}</option>
            </select>
          </label>
        </header>
        <div className="admin-content">
          <div className="admin-title">
            <div>
              <p>{t("admin.dashboard.eyebrow")}</p>
              <h1>{t(`admin.section.${section}.title` as TranslationKey)}</h1>
              <span>
                {t(`admin.section.${section}.description` as TranslationKey)}
              </span>
            </div>
            <small>
              {t("admin.dashboard.generated")}{" "}
              {formatDateTime(language, data.generatedAt)}
            </small>
          </div>
          {section === "users" && (
            <><AdminTable
              headers={[t("admin.table.name"), t("admin.table.role"), t("admin.table.status"), t("admin.table.created")]}
              rows={data.administrators.map((row) => [
                row.displayName,
                t(administratorRoleKey(row.role)),
                t(administratorStatusKey(row.status)),
                formatDateTime(language, row.createdAt),
              ])}
              empty={t("admin.empty.users")}
            /><div className="admin-accounting-access"><h2>{t("billing.accountingAccess")}</h2><p>{t("billing.accountingAccessHelp")}</p>{data.administrators.filter((row) => row.role === "manager").map((row) => <form action={setAccountingAccessAction} key={row.id}><input type="hidden" name="administratorId" value={row.id} /><span><strong>{row.displayName}</strong><small>{t(administratorRoleKey(row.role))}</small></span><input type="hidden" name="enabled" value={String(!row.accountingAccess)} /><b>{t(row.accountingAccess ? "billing.accessEnabled" : "billing.accessDisabled")}</b><button>{t(row.accountingAccess ? "billing.removeAccess" : "billing.grantAccess")}</button></form>)}</div></>
          )}
          {section === "doctors" && (
            <AdminTable
              headers={[t("admin.table.name"), t("admin.table.specialty"), t("admin.table.clinic"), t("admin.table.status")]}
              rows={data.clinicians.map((row) => [
                row.fullName,
                t(clinicianSpecialtyKey(row.specialty)),
                row.clinicName,
                t(clinicianStatusKey(row.status)),
              ])}
              empty={t("admin.empty.doctors")}
            />
          )}
          {section === "patients" && (
            <AdminTable
              headers={[t("admin.table.name"), t("admin.table.vitapassId"), t("admin.table.status")]}
              rows={data.patients.map((row) => [row.fullName, row.vitapassId, t(row.archived ? "admin.status.archived" : "admin.status.current")])}
              empty={t("admin.empty.patients")}
            />
          )}
          {section === "grants" && (
            <AdminTable
              headers={[t("admin.table.patient"), t("admin.table.doctor"), t("admin.table.permissions"), t("admin.table.status")]}
              rows={data.grants.map((row) => [
                row.patientId,
                row.clinicianId,
                [row.canView ? t("admin.permission.view") : "", row.canEdit ? t("admin.permission.edit") : ""].filter(Boolean).join(", "),
                t(grantStatusKey(row.status)),
              ])}
              empty={t("admin.empty.grants")}
            />
          )}
          {section === "audit" && (
            <AdminTable
              headers={[t("admin.table.time"), t("admin.table.action"), t("admin.table.resource")]}
              rows={data.auditEvents.map((row) => [
                formatDateTime(language, row.occurredAt),
                t(auditActionKey(row.action)),
                t(auditResourceKey(row.resourceType)),
              ])}
              empty={t("admin.empty.audit")}
            />
          )}
        </div>
      </section>
    </main>
  );
}

function AdminTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: string[][];
  empty: string;
}) {
  return (
    <div className="admin-table-card">
      {rows.length ? (
        <div className="admin-table-wrap">
          <table>
            <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${row[0]}-${rowIndex}`}>
                  {row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="admin-empty">{empty}</p>
      )}
    </div>
  );
}
