"use client";

import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";
import type { DoctorAccessRequest, DoctorPatientSummary, DoctorPortalData, PatientStatusKey } from "../demo-data";
import { formatDate, formatDateTime, formatRelativeTime, medicalKey, translate, type Language, type TranslationKey } from "../i18n";
import { useLanguage } from "../i18n/useLanguage";
import type { ConditionNoteState } from "./actions";
import PendingSubmitButton from "@/app/PendingSubmitButton";

type View = "overview" | "patients" | "requests" | "activity";
type Patient = DoctorPatientSummary;
type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string;
const initialConditionNoteState: ConditionNoteState = { status: "idle" };

const statusKeys: Record<PatientStatusKey, TranslationKey> = {
  upToDate: "doctor.status.upToDate",
  reviewDue: "doctor.status.reviewDue",
  newUpdate: "doctor.status.newUpdate",
};

function accessLabel(patient: Patient, t: Translator) {
  return patient.access.kind === "familyCareTeam"
    ? t("doctor.access.familyCareTeam")
    : t("doctor.access.temporary", { days: patient.access.days });
}

export default function DoctorPortal({
  initialData,
  logoutAction,
  viewPatientAction,
  updateConditionNoteAction,
}: {
  initialData: DoctorPortalData;
  logoutAction: () => Promise<void>;
  viewPatientAction: (
    patientId: string,
  ) => Promise<
    { ok: true } | { ok: false; error: "unauthorized" | "unavailable" }
  >;
  updateConditionNoteAction: (
    state: ConditionNoteState,
    formData: FormData,
  ) => Promise<ConditionNoteState>;
}) {
  const [language, setLanguage, languageReady] = useLanguage();
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [requests, setRequests] = useState(initialData.requests);
  const [requestState, setRequestState] = useState<Record<string, "approved" | "declined">>({});
  const [notice, setNotice] = useState("");
  const [openingPatientId, setOpeningPatientId] = useState<string | null>(null);
  const profileRequestInFlight = useRef(false);
  const t: Translator = (key, params) => translate(language, key, params);
  const patients = initialData.patients;
  const navItems: { id: View; key: TranslationKey; mark: string }[] = [
    { id: "overview", key: "doctor.nav.overview", mark: "01" },
    { id: "patients", key: "doctor.nav.patients", mark: "02" },
    { id: "requests", key: "doctor.nav.requests", mark: "03" },
    { id: "activity", key: "doctor.nav.activity", mark: "04" },
  ];

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return patients;
    return patients.filter((patient) => {
      const localizedConditions = patient.conditionKeys.map((key) => translate(language, medicalKey.condition(key)));
      return `${patient.name} ${patient.id} ${localizedConditions.join(" ")}`.toLocaleLowerCase().includes(term);
    });
  }, [language, patients, query]);

  const flash = (key: TranslationKey, params?: Record<string, string | number>) => {
    setNotice(t(key, params));
    window.setTimeout(() => setNotice(""), 2600);
  };
  const openPatient = async (patient: Patient) => {
    if (!patient.databaseId || profileRequestInFlight.current) return;
    profileRequestInFlight.current = true;
    setOpeningPatientId(patient.id);
    try {
      const result = await viewPatientAction(patient.databaseId);
      if (!result.ok) {
        flash(
          result.error === "unavailable"
            ? "notice.serviceUnavailable"
            : "notice.accessDenied",
        );
        return;
      }
      setSelected(patient);
    } catch {
      flash("notice.serviceUnavailable");
    } finally {
      profileRequestInFlight.current = false;
      setOpeningPatientId(null);
    }
  };
  const decideRequest = (request: DoctorAccessRequest, decision: "approved" | "declined") => {
    setRequestState((current) => ({ ...current, [request.id]: decision }));
    window.setTimeout(() => setRequests((current) => current.filter(({ id }) => id !== request.id)), 700);
    flash("notice.requestDecision", { name: request.name, decision: t(`common.${decision}` as TranslationKey) });
  };

  return (
    <main className={`dp-shell ${languageReady ? "" : "i18n-pending"}`}>
      <aside className="dp-sidebar">
        <Link className="dp-brand" href="/" aria-label={t("a11y.patientPortal")}><span className="dp-brand-mark">+</span><span>VitaPass<small>{t("doctor.brand.clinical")}</small></span></Link>
        <div className="dp-workspace"><span>{t("doctor.workspace")}</span><strong>{initialData.clinician.clinicName}</strong><small>{t("doctor.primaryCare")} · {initialData.clinician.clinicCountry}</small></div>
        <nav aria-label={t("a11y.doctorNavigation")}>{navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><i>{item.mark}</i><span>{t(item.key)}</span>{item.id === "requests" && requests.length > 0 && <b>{requests.length}</b>}</button>)}</nav>
        <div className="dp-security"><span className="dp-live-dot" /><div><strong>{t("doctor.secureSession")}</strong><small>{t("doctor.autoLock", { minutes: 26 })}</small></div></div>
        <div className="dp-clinician"><span>{initialData.clinician.initials}</span><div><strong>{initialData.clinician.name}</strong><small>{t("medical.specialty.familyMedicine")}</small></div><form action={logoutAction}><PendingSubmitButton aria-label={t("auth.logout")} title={t("auth.logout")}>↗</PendingSubmitButton></form></div>
      </aside>

      <section className="dp-main">
        <header className="dp-topbar">
          <button className="dp-menu" aria-label={t("a11y.openNavigation")}>+</button>
          <label className="dp-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => setView("patients")} placeholder={t("doctor.search.placeholder")} aria-label={t("a11y.searchPatients")} /><kbd>⌘ K</kbd></label>
          <label className="language dp-language"><span aria-hidden="true">◎</span><select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("a11y.languageSelector")}><option value="en">{t("language.en")}</option><option value="de">{t("language.de")}</option><option value="ro">{t("language.ro")}</option><option value="hu">{t("language.hu")}</option></select></label>
          <button className="dp-icon-button" aria-label={t("a11y.notifications")}><span className="dp-notification-dot" />●</button>
          <Link className="dp-exit" href="/">{t("doctor.patientPortal")}</Link>
        </header>

        <div className="dp-content">
          {view === "overview" && <>
            <div className="dp-welcome"><div><p>{formatDate(language, initialData.referenceTime, { weekday: "long", day: "numeric", month: "long" })}</p><h1>{t("doctor.welcome.greeting", { name: initialData.clinician.name })}</h1><span>{t("doctor.welcome.description")}</span></div><button onClick={() => setView("patients")}>{t("doctor.findPatient")}</button></div>
            <div className="dp-metrics">
              <article><span className="dp-metric-icon mint">P</span><div><strong>{initialData.metrics.patientCount}</strong><small>{t("doctor.metrics.patients")}</small></div><em>{t("doctor.metrics.activeGrants")}</em></article>
              <article><span className="dp-metric-icon amber">A</span><div><strong>{requests.length}</strong><small>{t("doctor.metrics.requests")}</small></div><em className="warn">{t("doctor.metrics.urgent", { count: initialData.metrics.urgentRequestCount })}</em></article>
              <article><span className="dp-metric-icon blue">R</span><div><strong>{initialData.metrics.reviewedLastThirtyDays}</strong><small>{t("doctor.metrics.reviewed")}</small></div><em>{t("doctor.metrics.last30Days")}</em></article>
            </div>
            <div className="dp-overview-grid">
              <section className="dp-panel"><div className="dp-panel-head"><div><h2>{t("doctor.review.title")}</h2><p>{t("doctor.review.description")}</p></div><button onClick={() => setView("patients")}>{t("doctor.viewAll")}</button></div><div className="dp-review-list">
                {patients.filter(({ statusKey }) => statusKey !== "upToDate").slice(0, 4).map((patient) => <button key={patient.id} disabled={openingPatientId !== null} onClick={() => openPatient(patient)}><span className="dp-patient-avatar">{patient.initials}</span><span><strong>{patient.name}</strong><small>{t("doctor.years", { count: patient.age })} · {patient.id}</small></span><span className={`dp-status ${patient.statusKey === "reviewDue" ? "due" : "new"}`}>{t(statusKeys[patient.statusKey])}</span><i>→</i></button>)}
                {!patients.some(({ statusKey }) => statusKey !== "upToDate") && <div className="dp-empty"><strong>{t("doctor.review.noneTitle")}</strong><span>{t("doctor.review.noneDescription")}</span></div>}
              </div></section>
              <section className="dp-panel"><div className="dp-panel-head"><div><h2>{t("doctor.nav.requests")}</h2><p>{t("doctor.requests.previewDescription")}</p></div><button onClick={() => setView("requests")}>{t("doctor.viewAll")}</button></div><div className="dp-request-preview">
                {requests.slice(0, 2).map((request) => <div key={request.id}><span className="dp-patient-avatar alt">{request.initials}</span><span><strong>{request.name}</strong><small>{t(`doctor.reason.${request.reasonKey}` as TranslationKey)} · {formatRelativeTime(language, request.receivedAt, initialData.referenceTime)}</small></span><b className={request.urgencyKey === "urgent" ? "urgent" : ""}>{t(`common.${request.urgencyKey}` as TranslationKey)}</b></div>)}
              </div><button className="dp-review-requests" onClick={() => setView("requests")}>{t("doctor.requests.reviewCount", { count: requests.length })}</button></section>
            </div>
            <section className="dp-panel dp-recent"><div className="dp-panel-head"><div><h2>{t("doctor.recent.title")}</h2><p>{t("doctor.recent.description")}</p></div><button onClick={() => setView("patients")}>{t("doctor.patientDirectory")}</button></div>{patients.length ? <PatientTable items={patients.slice(0, 4)} onOpen={openPatient} openingPatientId={openingPatientId} language={language} t={t} /> : <div className="dp-empty"><strong>{t("doctor.noGrants.title")}</strong><span>{t("doctor.noGrants.description")}</span></div>}</section>
          </>}

          {view === "patients" && <section className="dp-directory">
            <div className="dp-page-title"><div><p>{t("doctor.directory.eyebrow")}</p><h1>{query ? t("doctor.directory.results", { query }) : t("doctor.directory.title")}</h1><span>{t("doctor.directory.description")}</span></div><button onClick={() => flash("notice.inviteCopied")}>{t("doctor.directory.invite")}</button></div>
            <div className="dp-panel"><div className="dp-directory-tools"><span>{t(filtered.length === 1 ? "doctor.directory.patientCountOne" : "doctor.directory.patientCount", { count: filtered.length })}</span><div><button className="active">{t("common.all")}</button><button>{t("doctor.directory.needsReview")}</button><button>{t("common.temporary")}</button></div></div>
              {filtered.length ? <PatientTable items={filtered} onOpen={openPatient} openingPatientId={openingPatientId} language={language} t={t} /> : <div className="dp-empty"><strong>{t("doctor.directory.noMatchTitle")}</strong><span>{t("doctor.directory.noMatchDescription")}</span></div>}
            </div>
          </section>}

          {view === "requests" && <section className="dp-directory">
            <div className="dp-page-title"><div><p>{t("doctor.requests.eyebrow")}</p><h1>{t("doctor.requests.title")}</h1><span>{t("doctor.requests.description")}</span></div></div>
            <div className="dp-request-list">{requests.map((request) => { const decision = requestState[request.id]; return <article className="dp-panel" key={request.id}><span className="dp-patient-avatar alt">{request.initials}</span><div><strong>{request.name}</strong><p>{t(`doctor.reason.${request.reasonKey}` as TranslationKey)}</p><small>{t("doctor.requests.received", { time: formatRelativeTime(language, request.receivedAt, initialData.referenceTime) })}</small></div>{decision ? <span className={`dp-decision ${decision}`}>{t(`common.${decision}` as TranslationKey)}</span> : <div className="dp-request-actions"><button onClick={() => decideRequest(request, "declined")}>{t("doctor.requests.decline")}</button><button onClick={() => decideRequest(request, "approved")}>{t("doctor.requests.approve")}</button></div>}</article>; })}
              {!requests.length && <div className="dp-panel dp-empty"><strong>{t("doctor.requests.emptyTitle")}</strong><span>{t("doctor.requests.emptyDescription")}</span></div>}
            </div>
          </section>}

          {view === "activity" && <section className="dp-directory">
            <div className="dp-page-title"><div><p>{t("doctor.activity.eyebrow")}</p><h1>{t("doctor.activity.title")}</h1><span>{t("doctor.activity.description")}</span></div><button onClick={() => flash("notice.auditPrepared")}>{t("doctor.activity.export")}</button></div>
            <div className="dp-panel dp-activity-list">{initialData.activity.map((activity) => <div key={activity.id}><span className="dp-activity-mark" /><time>{formatDateTime(language, activity.occurredAt)}</time><div><strong>{activity.name}</strong><p>{t(`doctor.activity.${activity.actionKey}` as TranslationKey)}</p></div><b>{t(`doctor.activity.type.${activity.typeKey}` as TranslationKey)}</b></div>)}{!initialData.activity.length && <div className="dp-empty"><strong>{t("doctor.activity.emptyTitle")}</strong><span>{t("doctor.activity.emptyDescription")}</span></div>}</div>
          </section>}
        </div>
      </section>

      {selected && <div className="dp-drawer-backdrop" onMouseDown={() => setSelected(null)}><aside className="dp-drawer" role="dialog" aria-modal="true" aria-labelledby="patient-name" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dp-drawer-head"><span className="dp-patient-avatar large">{selected.initials}</span><div><small>{selected.id}</small><h2 id="patient-name">{selected.name}</h2><p>{t("doctor.years", { count: selected.age })} · {t(medicalKey.sex(selected.sexKey))}</p></div><button onClick={() => setSelected(null)} aria-label={t("a11y.closePatientProfile")}>×</button></div>
        <div className="dp-access-note"><span className="dp-live-dot" /><div><strong>{t("doctor.access.authorized")}</strong><small>{accessLabel(selected, t)}</small></div></div>
        {!selected.allergyKeys.includes("noneKnown") && <div className="dp-allergy-alert"><strong>{t("doctor.allergyAlert")}</strong><span>{selected.allergyKeys.map((key) => t(medicalKey.allergy(key))).join(" · ")}</span></div>}
        <section className="dp-record-section"><h3>{t("common.conditions")}</h3><div className="dp-record-tags">{selected.conditionKeys.map((key) => <span key={key}>{t(medicalKey.condition(key))}</span>)}</div>
          {selected.canEdit && selected.conditionRecords?.[0] && <ConditionNoteForm record={selected.conditionRecords[0]} action={updateConditionNoteAction} t={t} />}
        </section>
        <section className="dp-record-section"><h3>{t("doctor.currentMedications")}</h3>{selected.medications.map((medication) => <div className="dp-med-row" key={medication.name}><span aria-hidden="true">Rx</span><strong>{medication.name}{medication.dose && ` ${medication.dose}`}</strong></div>)}</section>
        <section className="dp-record-section"><h3>{t("doctor.lastClinicalReview")}</h3><p>{formatDate(language, selected.lastReview)} · {initialData.clinician.name}</p></section>
        <div className="dp-drawer-actions"><button onClick={() => flash("notice.noteOpened")}>{t("doctor.addClinicalNote")}</button><button onClick={() => { flash("notice.profileReviewed", { name: selected.name }); setSelected(null); }}>{t("doctor.markReviewed")}</button></div>
        <small className="dp-audit-note">{t("doctor.auditNote")}</small>
      </aside></div>}
      {notice && <div className="dp-toast" role="status">✓ {notice}</div>}
    </main>
  );
}

function ConditionNoteForm({
  record,
  action,
  t,
}: {
  record: NonNullable<Patient["conditionRecords"]>[number];
  action: (
    state: ConditionNoteState,
    formData: FormData,
  ) => Promise<ConditionNoteState>;
  t: Translator;
}) {
  const [state, formAction, pending] = useActionState(action, initialConditionNoteState);
  return <form className="dp-condition-note" action={formAction}>
    <input type="hidden" name="conditionId" value={record.id} />
    <label htmlFor={`clinical-note-${record.id}`}>{t("doctor.conditionNote.label")}</label>
    <textarea id={`clinical-note-${record.id}`} name="clinicalNote" maxLength={2000} defaultValue={record.note} />
    <small>{t("doctor.conditionNote.help")}</small>
    {state.status !== "idle" && <span className={state.status === "saved" ? "note-success" : "note-error"} role="status">{t(state.status === "saved" ? "doctor.conditionNote.saved" : state.status === "unavailable" ? "doctor.conditionNote.unavailable" : "doctor.conditionNote.unauthorized")}</span>}
    <button type="submit" disabled={pending}>{pending ? t("doctor.conditionNote.saving") : t("doctor.conditionNote.save")}</button>
  </form>;
}

function PatientTable({ items, onOpen, openingPatientId, language, t }: { items: Patient[]; onOpen: (patient: Patient) => void; openingPatientId: string | null; language: Language; t: Translator }) {
  return <div className="dp-table-wrap"><table className="dp-table"><thead><tr><th>{t("doctor.table.patient")}</th><th>{t("doctor.table.conditions")}</th><th>{t("doctor.table.lastReviewed")}</th><th>{t("doctor.table.status")}</th><th><span className="sr-only">{t("common.open")}</span></th></tr></thead><tbody>{items.map((patient) => <tr key={patient.id} onClick={() => openingPatientId === null && onOpen(patient)}>
    <td><span className="dp-patient-avatar">{patient.initials}</span><span><strong>{patient.name}</strong><small>{patient.id}</small></span></td><td>{patient.conditionKeys.map((key) => t(medicalKey.condition(key))).join(", ")}</td><td>{formatDate(language, patient.lastReview, { day: "numeric", month: "short", year: "numeric" })}</td><td><span className={`dp-status ${patient.statusKey === "reviewDue" ? "due" : patient.statusKey === "newUpdate" ? "new" : "current"}`}>{t(statusKeys[patient.statusKey])}</span></td><td><button disabled={openingPatientId !== null} onClick={(event) => { event.stopPropagation(); onOpen(patient); }} aria-label={t("a11y.openPatientProfile", { name: patient.name })}>→</button></td>
  </tr>)}</tbody></table></div>;
}
