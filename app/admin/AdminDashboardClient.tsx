"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { formatDateTime, translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import PendingSubmitButton from "@/app/PendingSubmitButton";
import { brand } from "@/lib/brand";
import type { AdminDashboardData, AdminSection } from "@/lib/dal/admin";
import { adminLogoutAction } from "./actions";
import { AccountStatusControl, OrganisationAdministration, ProviderAdministration, WorkshopAdministration } from "./AdminWorkflowForms";
import { updateSupportTicketAction } from "./support-actions";

type T = (key: TranslationKey) => string;
const sections: Array<{ id: AdminSection; href: string; key: TranslationKey; count?: keyof AdminDashboardData["counts"] }> = [
  { id: "overview", href: "/admin", key: "automotiveAdmin.nav.overview" },
  { id: "providers", href: "/admin/providers", key: "automotiveAdmin.nav.providers", count: "providers" },
  { id: "workshops", href: "/admin/workshops", key: "automotiveAdmin.nav.workshops", count: "workshops" },
  { id: "customers", href: "/admin/customers", key: "automotiveAdmin.nav.customers", count: "customers" },
  { id: "managers", href: "/admin/managers", key: "automotiveAdmin.nav.managers", count: "managers" },
  { id: "sms", href: "/admin/sms", key: "automotiveAdmin.nav.sms", count: "smsAttention" },
  { id: "support", href: "/admin/support", key: "automotiveAdmin.nav.support", count: "openTickets" },
  { id: "security", href: "/admin/security", key: "automotiveAdmin.nav.security" },
];

function Table({ headers, rows, empty }: { headers: string[]; rows: Array<Array<string | number | ReactNode>>; empty: string }) {
  return <div className="admin-table-card"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>) : <tr><td colSpan={headers.length}>{empty}</td></tr>}</tbody></table></div>;
}
function Status({ value, t }: { value: string; t: T }) {
  return <b className={`admin-status ${value}`}>{t(`commercialAdmin.providerStatus.${value}` as TranslationKey)}</b>;
}
function Overview({ data, language, t }: { data: AdminDashboardData; language: Language; t: T }) {
  const metrics: Array<[number, TranslationKey]> = [
    [data.counts.providers, "automotiveAdmin.nav.providers"], [data.counts.workshops, "automotiveAdmin.nav.workshops"],
    [data.counts.customers, "automotiveAdmin.nav.customers"], [data.counts.openBookings, "automotiveAdmin.openBookings"],
    [data.counts.smsAttention, "automotiveAdmin.smsAttention"], [data.counts.openTickets, "automotiveAdmin.nav.support"],
  ];
  return <><div className="admin-metrics">{metrics.map(([value, key]) => <article key={key}><strong>{value}</strong><span>{t(key)}</span></article>)}</div><h2>{t("automotiveAdmin.recentProviders")}</h2><Table headers={[t("automotiveAdmin.provider"), t("common.status"), t("automotiveAdmin.workshops"), t("automotiveAdmin.created")]} rows={data.providers.slice(0, 8).map((provider) => [provider.displayName, <Status key={provider.id} value={provider.status} t={t} />, provider.workshopCount, formatDateTime(language, provider.createdAt)])} empty={t("automotiveAdmin.empty")} /></>;
}

function SupportTickets({ data, language, t }: { data: AdminDashboardData; language: Language; t: T }) {
  return <section className="admin-support-queue">
    <header><h2>{t("adminSupport.title")}</h2><p>{t("adminSupport.description")}</p></header>
    <div>{data.supportTickets.map((ticket) => {
      const account = data.workflow.accounts.find((item) => item.email.toLowerCase() === ticket.requesterEmail.toLowerCase());
      const isAccountClosure = ticket.ticketType === "account_closure";
      return <article key={ticket.id}>
      <header><div><span>{ticket.reference} · {t(`adminSupport.type.${ticket.ticketType}` as TranslationKey)}</span><h3>{ticket.subject}</h3></div><b className={`admin-status ${ticket.status}`}>{t(`adminSupport.status.${ticket.status}` as TranslationKey)}</b></header>
      <dl><div><dt>{t("adminSupport.requester")}</dt><dd>{ticket.requesterName} · <a href={`mailto:${ticket.requesterEmail}`}>{ticket.requesterEmail}</a></dd></div><div><dt>{t("adminSupport.accountType")}</dt><dd>{t(`contact.requester.${ticket.requesterType === "service_organisation" ? "organisation" : ticket.requesterType === "workshop_manager" ? "manager" : ticket.requesterType}` as TranslationKey)}</dd></div><div><dt>{t("adminSupport.created")}</dt><dd>{formatDateTime(language, ticket.createdAt)}</dd></div></dl>
      <p className="admin-support-message">{ticket.description}</p>
      {ticket.pageUrl && <a href={ticket.pageUrl} target="_blank" rel="noreferrer">{t("adminSupport.openPage")}</a>}
      {isAccountClosure && <section className="admin-closure-workflow">
        <header><div><p>{t("adminSupport.closureTitle")}</p><span>{t(`adminSupport.closureStage.${ticket.closureStage}` as TranslationKey)}</span></div>{ticket.deletionDueAt && <time>{t("adminSupport.deletionDue")}: {formatDateTime(language, ticket.deletionDueAt)}</time>}</header>
        {account ? <div><p>{t("adminSupport.matchingAccount")}</p><AccountStatusControl account={account} t={t} /></div> : <p>{t("adminSupport.noMatchingAccount")}</p>}
      </section>}
      <form action={updateSupportTicketAction}><input type="hidden" name="ticketId" value={ticket.id} /><label>{t("adminSupport.statusLabel")}<select name="status" defaultValue={ticket.status}><option value="open">{t("adminSupport.status.open")}</option><option value="in_progress">{t("adminSupport.status.in_progress")}</option><option value="waiting_on_requester">{t("adminSupport.status.waiting_on_requester")}</option><option value="resolved">{t("adminSupport.status.resolved")}</option><option value="closed">{t("adminSupport.status.closed")}</option></select></label>{isAccountClosure ? <><label>{t("adminSupport.closureStageLabel")}<select name="closureStage" defaultValue={ticket.closureStage}><option value="requested">{t("adminSupport.closureStage.requested")}</option><option value="account_suspended">{t("adminSupport.closureStage.account_suspended")}</option><option value="scheduled_for_deletion">{t("adminSupport.closureStage.scheduled_for_deletion")}</option><option value="deletion_completed">{t("adminSupport.closureStage.deletion_completed")}</option><option value="cancelled">{t("adminSupport.closureStage.cancelled")}</option></select></label><label>{t("adminSupport.closureWait")}<select name="closureWaitDays" defaultValue={ticket.closureWaitDays?.toString() ?? ""}><option value="">—</option><option value="30">{t("adminSupport.wait30")}</option><option value="60">{t("adminSupport.wait60")}</option></select></label></> : <><input type="hidden" name="closureStage" value="not_applicable" /><input type="hidden" name="closureWaitDays" value="" /></>}<label>{t("adminSupport.internalNote")}<textarea name="internalNote" defaultValue={ticket.internalNote ?? ""} maxLength={3000} rows={3} /></label><button>{t("adminSupport.save")}</button></form>
    </article>})}</div>
    {!data.supportTickets.length && <p>{t("adminSupport.empty")}</p>}
  </section>;
}

function Content({ section, data, language, t }: { section: AdminSection; data: AdminDashboardData; language: Language; t: T }) {
  if (section === "overview") return <Overview data={data} language={language} t={t} />;
  if (section === "providers") return <><OrganisationAdministration providers={data.providers} invitations={data.workflow.invitations} workshops={data.workflow.workshops} t={t} /><ProviderAdministration providers={data.providers} workflow={data.workflow} language={language} t={t} /></>;
  if (section === "workshops") return <WorkshopAdministration providers={data.providers} workflow={data.workflow} language={language} t={t} />;
  if (section === "customers") return <Table headers={[t("automotiveAdmin.customer"), t("automotiveAdmin.phone"), t("automotiveAdmin.vehicles"), t("automotiveAdmin.bookings"), t("adminWorkflow.accountStatus")]} rows={data.customers.map((row) => {
    const account = data.workflow.accounts.find((item) => item.customerId === row.id);
    return [row.fullName, row.phone ?? "—", row.vehicleCount, row.bookingCount, account ? <AccountStatusControl key={row.id} account={account} t={t} /> : "—"];
  })} empty={t("automotiveAdmin.empty")} />;
  if (section === "managers") return <Table headers={[t("automotiveAdmin.manager"), t("automotiveAdmin.providers"), t("common.status"), t("adminWorkflow.accountStatus")]} rows={data.managers.map((row) => {
    const manager = data.workflow.managers.find((item) => item.id === row.id);
    const account = manager ? data.workflow.accounts.find((item) => item.authUserId === manager.authUserId) : undefined;
    return [row.displayName, row.providerNames.join(", ") || "—", <Status key={row.id} value={row.status} t={t} />, account ? <AccountStatusControl key={row.id} account={account} t={t} /> : "—"];
  })} empty={t("automotiveAdmin.empty")} />;
  if (section === "sms") return <><h2>{t("phase8.admin.whatsapp")}</h2><Table headers={[t("phase8.admin.optedIn"), t("phase8.admin.inbound"), t("phase8.admin.accepted"), t("phase8.admin.delivered"), t("phase8.admin.read"), t("automotiveAdmin.failed")]} rows={[[data.whatsapp.optedInBookings, data.whatsapp.inboundMessages, data.whatsapp.accepted, data.whatsapp.delivered, data.whatsapp.read, data.whatsapp.failed]]} empty={t("automotiveAdmin.empty")} /><h2>{t("phase8.admin.smsFallback")}</h2><Table headers={[t("automotiveAdmin.smsEvent"), t("automotiveAdmin.pending"), t("automotiveAdmin.sent"), t("automotiveAdmin.failed")]} rows={data.sms.map((row) => [t(`automotiveAdmin.sms.${row.kind}` as TranslationKey), row.pending, row.sent, row.failed])} empty={t("automotiveAdmin.empty")} /><h2>{t("phase7.admin.outbox")}</h2><Table headers={[t("automotiveAdmin.pending"), t("phase7.admin.retryable"), t("phase7.admin.exhausted"), t("automotiveAdmin.sent")]} rows={[[data.communications.pending, data.communications.retryable, data.communications.exhausted, data.communications.sent]]} empty={t("automotiveAdmin.empty")} /></>;
  if (section === "support") return <SupportTickets data={data} language={language} t={t} />;
  return <><article className="admin-panel"><h2>{t("automotiveAdmin.securityTitle")}</h2><p>{t("automotiveAdmin.securityDescription")}</p><dl><div><dt>{t("automotiveAdmin.role")}</dt><dd>{data.administrator.role}</dd></div><div><dt>{t("automotiveAdmin.session")}</dt><dd>AAL2</dd></div><div><dt>{t("automotiveAdmin.generated")}</dt><dd>{formatDateTime(language, data.generatedAt)}</dd></div></dl></article><Table headers={[t("adminWorkflow.account"), t("adminWorkflow.accountType"), t("adminWorkflow.accountStatus"), t("adminWorkflow.operation")]} rows={data.workflow.accounts.map((account) => [<span key={account.authUserId}><strong>{account.displayName}</strong><small>{account.email}</small></span>, account.accountType, t(`adminWorkflow.status.${account.status}` as TranslationKey), <AccountStatusControl key={account.authUserId} account={account} t={t} />])} empty={t("automotiveAdmin.empty")} /></>;
}

export default function AdminDashboard({ data, section = "overview" }: { data: AdminDashboardData; section?: AdminSection }) {
  const [language, setLanguage, ready] = useLanguage();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { const frame = requestAnimationFrame(() => setCollapsed(localStorage.getItem("pitster.sidebar.admin") === "collapsed")); return () => cancelAnimationFrame(frame); }, []);
  const toggle = () => setCollapsed((current) => { const next = !current; localStorage.setItem("pitster.sidebar.admin", next ? "collapsed" : "expanded"); return next; });
  const t: T = (key) => translate(language, key);
  return <main className={`admin-shell ${collapsed ? "admin-navigation-collapsed " : ""}${ready ? "" : "i18n-pending"}`}><aside className="admin-sidebar"><Link href="/" className="admin-brand"><span>{brand.mark}</span><strong>{brand.name}</strong></Link><button className="admin-navigation-toggle" type="button" onClick={toggle} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>{collapsed ? ">" : "<"}</button><p>{t("automotiveAdmin.console")}</p><nav aria-label={t("automotiveAdmin.navigation")}>{sections.map((item) => <Link key={item.id} href={item.href} className={section === item.id ? "active" : ""}><span>{t(item.key)}</span>{item.count && <b>{data.counts[item.count]}</b>}</Link>)}<Link href="/admin/invoicing"><span>{t("admin.nav.invoicing")}</span></Link></nav><div className="admin-identity"><small>{data.administrator.role} · AAL2</small><strong title={data.administrator.displayName}>{data.administrator.displayName}</strong><span title={data.administrator.email}>{data.administrator.email}</span><form action={adminLogoutAction}><PendingSubmitButton>{t("auth.logout")}</PendingSubmitButton></form></div></aside><section className="admin-main"><header className="admin-topbar"><div><small>{t("automotiveAdmin.console")}</small><strong>{t(`automotiveAdmin.nav.${section}` as TranslationKey)}</strong></div><label className="language"><select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("a11y.languageSelector")}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select></label></header><div className="admin-content"><Content section={section} data={data} language={language} t={t} /></div></section></main>;
}
