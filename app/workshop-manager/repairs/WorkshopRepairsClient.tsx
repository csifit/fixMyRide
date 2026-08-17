"use client";

import Link from "@/app/WorkspaceLink";
import { useActionState, useMemo, useState } from "react";
import { formatDateTime, locales, translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { ManagedRepairWorkflow, RepairWorkflowAction } from "@/lib/dal/repair-workflows";
import { manageRepairAction, type RepairActionState } from "./actions";
import VehicleServiceRecordForm from "./VehicleServiceRecordForm";
import ServiceOrderControls from "./ServiceOrderControls";

type Translate = (key: TranslationKey) => string;
const idle: RepairActionState = { status: "idle" };
const terminal = ["completed", "no_show"];

function money(language: Language, cents: number, currency: string) {
  return new Intl.NumberFormat(locales[language], { style: "currency", currency }).format(cents / 100);
}

function SimpleAction({ bookingId, kind, t, danger = false }: { bookingId: string; kind: RepairWorkflowAction; t: Translate; danger?: boolean }) {
  const [state, action, pending] = useActionState(manageRepairAction, idle);
  return <form className={`booking-action-form ${danger ? "danger" : ""}`} action={action}>
    <input type="hidden" name="bookingId" value={bookingId} /><input type="hidden" name="action" value={kind} /><input type="hidden" name="diagnosis" value="" /><input type="hidden" name="currency" value="EUR" /><input type="hidden" name="items" value="[]" />
    <label>{t("repairLifecycle.note")}<textarea name="note" rows={2} maxLength={2000} /></label>
    {state.status !== "idle" && <p className={state.status === "saved" ? "note-success" : "note-error"}>{t(`repairLifecycle.result.${state.status}` as TranslationKey)}</p>}
    <button disabled={pending}>{t(pending ? "repairLifecycle.saving" : `repairLifecycle.action.${kind}` as TranslationKey)}</button>
  </form>;
}

function EstimateForm({ bookingId, t }: { bookingId: string; t: Translate }) {
  const [state, action, pending] = useActionState(manageRepairAction, idle);
  const [items, setItems] = useState([{ type: "labor" as "labor" | "part" | "other", description: "", quantity: 1, unitPrice: "" }]);
  const payload = items.map((item) => ({ type: item.type, description: item.description, quantity: item.quantity, unitPriceCents: Math.round((Number(item.unitPrice) || 0) * 100) }));
  return <form className="repair-estimate-form" action={action}>
    <input type="hidden" name="bookingId" value={bookingId} /><input type="hidden" name="action" value="submit_estimate" /><input type="hidden" name="items" value={JSON.stringify(payload)} />
    <label>{t("repairLifecycle.diagnosis")}<textarea name="diagnosis" rows={4} minLength={3} maxLength={4000} required /></label>
    <div className="repair-estimate-heading"><strong>{t("repairLifecycle.items")}</strong><button type="button" onClick={() => setItems((current) => [...current, { type: "part", description: "", quantity: 1, unitPrice: "" }])}>{t("repairLifecycle.addItem")}</button></div>
    {items.map((item, index) => <div className="repair-estimate-item" key={index}>
      <select aria-label={t("repairLifecycle.itemType")} value={item.type} onChange={(event) => setItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, type: event.target.value as typeof entry.type } : entry))}><option value="labor">{t("repairLifecycle.type.labor")}</option><option value="part">{t("repairLifecycle.type.part")}</option><option value="other">{t("repairLifecycle.type.other")}</option></select>
      <input aria-label={t("repairLifecycle.itemDescription")} placeholder={t("repairLifecycle.itemDescription")} value={item.description} minLength={2} maxLength={500} required onChange={(event) => setItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, description: event.target.value } : entry))} />
      <input aria-label={t("repairLifecycle.quantity")} type="number" min="0.01" step="0.01" value={item.quantity} required onChange={(event) => setItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, quantity: Number(event.target.value) } : entry))} />
      <input aria-label={t("repairLifecycle.unitPrice")} type="number" min="0" step="0.01" value={item.unitPrice} required onChange={(event) => setItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, unitPrice: event.target.value } : entry))} />
      {items.length > 1 && <button type="button" aria-label={t("repairLifecycle.removeItem")} onClick={() => setItems((current) => current.filter((_, entryIndex) => entryIndex !== index))}>×</button>}
    </div>)}
    <div className="repair-estimate-footer"><label>{t("repairLifecycle.currency")}<select name="currency"><option>EUR</option><option>RON</option><option>HUF</option></select></label><label>{t("repairLifecycle.customerNote")}<textarea name="note" rows={2} maxLength={2000} /></label></div>
    {state.status !== "idle" && <p className={state.status === "saved" ? "note-success" : "note-error"}>{t(`repairLifecycle.result.${state.status}` as TranslationKey)}</p>}
    <button className="organization-action" disabled={pending}>{t(pending ? "repairLifecycle.saving" : "repairLifecycle.sendEstimate")}</button>
  </form>;
}

function Estimate({ repair, language, t }: { repair: ManagedRepairWorkflow; language: Language; t: Translate }) {
  const estimate = repair.estimate;
  if (!estimate) return null;
  return <section className="repair-estimate-summary"><header><div><p>{t("repairLifecycle.estimate")} #{estimate.version}</p><h3>{money(language, estimate.totalCents, estimate.currency)}</h3></div><em>{t(`repairLifecycle.estimateStatus.${estimate.status}` as TranslationKey)}</em></header><p><b>{t("repairLifecycle.diagnosis")}</b>{estimate.diagnosisSummary}</p><table><tbody>{estimate.items.map((item, index) => <tr key={index}><td>{t(`repairLifecycle.type.${item.type}` as TranslationKey)}</td><th>{item.description}</th><td>{item.quantity} × {money(language, item.unitPriceCents, estimate.currency)}</td><td>{money(language, item.lineTotalCents, estimate.currency)}</td></tr>)}</tbody><tfoot><tr><th colSpan={3}>{t("repairLifecycle.total")}</th><td>{money(language, estimate.totalCents, estimate.currency)}</td></tr></tfoot></table>{estimate.customerNote && <p>{estimate.customerNote}</p>}{estimate.decisionNote && <p><b>{t("repairLifecycle.customerDecisionNote")}</b>{estimate.decisionNote}</p>}</section>;
}

function RepairCard({ repair, language, t }: { repair: ManagedRepairWorkflow; language: Language; t: Translate }) {
  return <details className={`booking-inbox-card status-${repair.status}`} open={!terminal.includes(repair.status)}><summary><span><b>{repair.vehicleRegistration}</b><strong>{repair.vehicleMake} {repair.vehicleModel}</strong><small>{repair.serviceName} · {repair.workshopName}</small></span><span><small>{t("repairLifecycle.appointment")}</small>{repair.confirmedStart ? <time>{formatDateTime(language, repair.confirmedStart)}</time> : <span>—</span>}</span><em>{t(`workshopBookings.status.${repair.status}` as TranslationKey)}</em></summary><div className="booking-inbox-detail"><section className="booking-inbox-facts"><h3>{t("repairLifecycle.jobDetails")}</h3><dl><div><dt>{t("workshopBookings.customer")}</dt><dd>{repair.customerName}<br /><a href={`tel:${repair.customerPhone}`}>{repair.customerPhone}</a><br /><a href={`mailto:${repair.customerEmail}`}>{repair.customerEmail}</a></dd></div><div><dt>{t("workshopBookings.vehicle")}</dt><dd>{repair.vehicleMake} {repair.vehicleModel}{repair.vehicleYear ? ` (${repair.vehicleYear})` : ""}<br />{repair.vehicleRegistration}</dd></div></dl>{repair.customerNote && <p>{repair.customerNote}</p>}<Estimate repair={repair} language={language} t={t} /></section><section className="booking-inbox-actions"><h3>{t("repairLifecycle.nextAction")}</h3>
    {repair.status === "confirmed" && <><SimpleAction bookingId={repair.id} kind="check_in" t={t} /><SimpleAction bookingId={repair.id} kind="mark_no_show" t={t} danger /></>}
    {repair.status === "checked_in" && <SimpleAction bookingId={repair.id} kind="start_diagnosis" t={t} />}
    {repair.status === "diagnosing" && <EstimateForm bookingId={repair.id} t={t} />}
    {repair.status === "awaiting_approval" && repair.estimate?.status === "approved" && <SimpleAction bookingId={repair.id} kind="start_work" t={t} />}
    {repair.status === "awaiting_approval" && repair.estimate?.status === "awaiting_customer" && <p>{t("repairLifecycle.waitingCustomer")}</p>}
    {repair.status === "in_service" && <SimpleAction bookingId={repair.id} kind="ready_for_collection" t={t} />}
    {repair.status === "ready_for_collection" && <SimpleAction bookingId={repair.id} kind="complete" t={t} />}
    {terminal.includes(repair.status) && <p>{t("repairLifecycle.noActions")}</p>}
  </section>{["confirmed", "checked_in"].includes(repair.status) && <ServiceOrderControls repair={repair} t={t} />}<section className="booking-inbox-history"><h3>{t("workshopBookings.history")}</h3>{repair.history.map((item, index) => <article key={`${item.createdAt}-${index}`}><span><b>{t(`workshopBookings.history.${item.action}` as TranslationKey)}</b><time>{formatDateTime(language, item.createdAt)}</time></span>{item.note && <p>{item.note}</p>}</article>)}</section><VehicleServiceRecordForm repair={repair} t={t} /></div></details>;
}

export default function WorkshopRepairsClient({ repairs, logoutAction }: { repairs: ManagedRepairWorkflow[]; logoutAction: () => Promise<void> }) {
  const [language, setLanguage, ready] = useLanguage(); const [filter, setFilter] = useState("active"); const t = (key: TranslationKey) => translate(language, key);
  const visible = useMemo(() => repairs.filter((repair) => filter === "all" || (filter === "active" ? !terminal.includes(repair.status) : repair.status === filter)), [repairs, filter]);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  return <main className="settings-shell booking-inbox-shell"><header className="settings-topbar"><Link href="/workshop-manager">← {t("workspace.back")}</Link><strong>pitster</strong><select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("a11y.languageSelector")}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select><form action={logoutAction}><button>{t("auth.logout")}</button></form></header><section className="settings-content booking-inbox-content"><p className="registration-kicker">{t("repairLifecycle.eyebrow")}</p><h1>{t("repairLifecycle.title")}</h1><p>{t("repairLifecycle.description")}</p><div className="booking-inbox-toolbar"><strong>{visible.length} {t("repairLifecycle.visible")}</strong><label>{t("workshopBookings.filter")}<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="active">{t("repairLifecycle.filter.active")}</option><option value="completed">{t("workshopBookings.status.completed")}</option><option value="no_show">{t("workshopBookings.status.no_show")}</option><option value="all">{t("workshopBookings.filter.all")}</option></select></label></div><div className="booking-inbox-list">{visible.map((repair) => <RepairCard key={repair.id} repair={repair} language={language} t={t} />)}{!visible.length && <div className="catalogue-empty"><h2>{t("repairLifecycle.emptyTitle")}</h2><p>{t("repairLifecycle.emptyDescription")}</p></div>}</div></section></main>;
}
