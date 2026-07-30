"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DoctorAccessRequest, DoctorPatientSummary, DoctorPortalData, PatientStatusKey } from "../demo-data";
import { formatDate, formatDateTime, formatRelativeTime, medicalKey, translate, type Language, type TranslationKey } from "../i18n";
import { useLanguage } from "../i18n/useLanguage";
import type {
  ConditionNoteState,
  HealthDataMutationState,
  SensitiveIdentifierReadResult,
} from "./actions";
import PendingSubmitButton from "@/app/PendingSubmitButton";

type View = "overview" | "patients" | "requests" | "activity";
type Patient = DoctorPatientSummary;
type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string;
const initialConditionNoteState: ConditionNoteState = { status: "idle" };
const initialHealthMutationState: HealthDataMutationState = {
  status: "idle",
};
type HealthMutationAction = (
  state: HealthDataMutationState,
  formData: FormData,
) => Promise<HealthDataMutationState>;

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
  readSensitiveIdentifiersAction,
  updateHealthCardProfileAction,
  updateSensitiveIdentifiersAction,
  createLifeThreateningDiagnosisAction,
  updateLifeThreateningDiagnosisAction,
  deactivateLifeThreateningDiagnosisAction,
  reactivateLifeThreateningDiagnosisAction,
  updateConditionNoteAction,
}: {
  initialData: DoctorPortalData;
  logoutAction: () => Promise<void>;
  viewPatientAction: (
    patientId: string,
  ) => Promise<
    { ok: true } | { ok: false; error: "unauthorized" | "unavailable" }
  >;
  readSensitiveIdentifiersAction: (
    patientId: string,
  ) => Promise<SensitiveIdentifierReadResult>;
  updateHealthCardProfileAction: HealthMutationAction;
  updateSensitiveIdentifiersAction: HealthMutationAction;
  createLifeThreateningDiagnosisAction: HealthMutationAction;
  updateLifeThreateningDiagnosisAction: HealthMutationAction;
  deactivateLifeThreateningDiagnosisAction: HealthMutationAction;
  reactivateLifeThreateningDiagnosisAction: HealthMutationAction;
  updateConditionNoteAction: (
    state: ConditionNoteState,
    formData: FormData,
  ) => Promise<ConditionNoteState>;
}) {
  const [language, setLanguage, languageReady] = useLanguage();
  const patients = initialData.patients;
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    null,
  );
  const [requests, setRequests] = useState(initialData.requests);
  const [requestState, setRequestState] = useState<Record<string, "approved" | "declined">>({});
  const [notice, setNotice] = useState("");
  const [openingPatientId, setOpeningPatientId] = useState<string | null>(null);
  const profileRequestInFlight = useRef(false);
  const t: Translator = (key, params) => translate(language, key, params);
  const selected = useMemo(
    () =>
      patients.find((patient) => patient.id === selectedPatientId) ?? null,
    [patients, selectedPatientId],
  );
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
      setSelectedPatientId(patient.id);
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
        <div className="dp-workspace"><span>{t("doctor.workspace")}</span><strong>{initialData.clinician.clinicName}</strong><small>{t("doctor.primaryCare")} · {initialData.clinician.clinicCountry}</small><Link href="/doctor/appointments">{t("appointments.title")}</Link><Link href="/doctor/invoicing">{t("invoicing.title")}</Link><Link href="/doctor/staff">{t("organization.staff.eyebrow")}</Link></div>
        <Link href="/doctor/availability">{t("availability.title")}</Link>
        <nav aria-label={t("a11y.doctorNavigation")}>{navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><i>{item.mark}</i><span>{t(item.key)}</span>{item.id === "requests" && requests.length > 0 && <b>{requests.length}</b>}</button>)}</nav>
        <div className="dp-security"><span className="dp-live-dot" /><div><strong>{t("doctor.secureSession")}</strong><small>{t("doctor.autoLock", { minutes: 26 })}</small></div></div>
        <div className="dp-clinician"><span>{initialData.clinician.initials}</span><div><strong>{initialData.clinician.name}</strong><small>{t("medical.specialty.familyMedicine")}</small></div><form action={logoutAction}><PendingSubmitButton aria-label={t("auth.logout")} title={t("auth.logout")}>{t("auth.logout")}</PendingSubmitButton></form></div>
      </aside>

      <section className="dp-main">
        <header className="dp-topbar">
          <button className="dp-menu" aria-label={t("a11y.openNavigation")}>+</button>
          <label className="dp-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => setView("patients")} placeholder={t("doctor.search.placeholder")} aria-label={t("a11y.searchPatients")} /><kbd>⌘ K</kbd></label>
          <label className="language dp-language"><span aria-hidden="true">◎</span><select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("a11y.languageSelector")}><option value="en">{t("language.en")}</option><option value="de">{t("language.de")}</option><option value="ro">{t("language.ro")}</option><option value="hu">{t("language.hu")}</option></select></label>
          <button className="dp-icon-button" aria-label={t("a11y.notifications")}><span className="dp-notification-dot" />●</button>
          <Link className="dp-exit" href="/">{t("doctor.patientPortal")}</Link>
        </header>
        <nav className="dp-primary-actions" aria-label={t("a11y.doctorNavigation")}>
          <Link href="/doctor/appointments">{t("appointments.title")}</Link>
          <Link href="/doctor/availability">{t("availability.title")}</Link>
          <Link href="/doctor/staff">{t("organization.staff.eyebrow")}</Link>
          <Link href="/doctor/invoicing">{t("invoicing.title")}</Link>
          <form action={logoutAction}><PendingSubmitButton>{t("auth.logout")}</PendingSubmitButton></form>
        </nav>

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

      {selected && <div className="dp-drawer-backdrop" onMouseDown={() => setSelectedPatientId(null)}><aside className="dp-drawer" role="dialog" aria-modal="true" aria-labelledby="patient-name" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dp-drawer-head"><span className="dp-patient-avatar large">{selected.initials}</span><div><small>{selected.id}</small><h2 id="patient-name">{selected.name}</h2><p>{t("doctor.years", { count: selected.age })} · {t(medicalKey.sex(selected.sexKey))}</p></div><button onClick={() => setSelectedPatientId(null)} aria-label={t("a11y.closePatientProfile")}>×</button></div>
        <div className="dp-access-note"><span className="dp-live-dot" /><div><strong>{t("doctor.access.authorized")}</strong><small>{accessLabel(selected, t)}</small></div></div>
        <section className="dp-record-section health-card-section">
          <h3>{t("doctor.health.identity.title")}</h3>
          <dl className="dp-health-grid">
            <div><dt>{t("doctor.health.familyName")}</dt><dd>{selected.familyName ?? t("common.notRecorded")}</dd></div>
            <div><dt>{t("doctor.health.givenNames")}</dt><dd>{selected.givenNames ?? t("common.notRecorded")}</dd></div>
          </dl>
        </section>
        <section className="dp-record-section health-card-section">
          <h3>{t("doctor.health.insurance.title")}</h3>
          <dl className="dp-health-grid">
            <div><dt>{t("doctor.health.insurance.status")}</dt><dd>{t(`doctor.health.insurance.status.${selected.insuranceStatus ?? "unknown"}` as TranslationKey)}</dd></div>
            <div><dt>{t("doctor.health.insurance.source")}</dt><dd>{t(`doctor.health.insurance.source.${selected.insuranceVerificationSource ?? "not_verified"}` as TranslationKey)}</dd></div>
            <div><dt>{t("doctor.health.insurance.house")}</dt><dd>{[selected.insuranceHouseCode, selected.insuranceHouseName].filter(Boolean).join(" · ") || t("common.notRecorded")}</dd></div>
            <div><dt>{t("doctor.health.verifiedAt")}</dt><dd>{selected.insuranceVerifiedAt ? formatDateTime(language, selected.insuranceVerifiedAt) : t("common.notRecorded")}</dd></div>
          </dl>
        </section>
        <section className="dp-record-section health-card-section critical-diagnoses">
          <h3>{t("doctor.health.lifeThreatening.title")}</h3>
          {selected.lifeThreateningDiagnoses?.length ? selected.lifeThreateningDiagnoses.map((diagnosis) => <article key={diagnosis.id}>
            <strong>{diagnosis.name}</strong>
            <span>{diagnosis.codeSystem === "other" && diagnosis.otherCodeSystemName ? diagnosis.otherCodeSystemName : t(`doctor.health.codeSystem.${diagnosis.codeSystem}` as TranslationKey)} · {diagnosis.code}</span>
            <small>{t("doctor.health.verifiedBy", { name: diagnosis.verifiedByName, code: diagnosis.verifiedByCode, date: formatDateTime(language, diagnosis.verifiedAt) })}</small>
            {selected.canEdit && selected.databaseId && <DiagnosisMutationForm
              key={`${diagnosis.id}:${diagnosis.verifiedAt}`}
              patientId={selected.databaseId}
              diagnosis={diagnosis}
              isActive
              updateAction={updateLifeThreateningDiagnosisAction}
              deactivateAction={deactivateLifeThreateningDiagnosisAction}
              reactivateAction={reactivateLifeThreateningDiagnosisAction}
              t={t}
            />}
          </article>) : <p>{t("doctor.health.lifeThreatening.none")}</p>}
          {selected.canEdit && selected.databaseId && <DiagnosisCreateForm
            patientId={selected.databaseId}
            action={createLifeThreateningDiagnosisAction}
            t={t}
          />}
        </section>
        {selected.canEdit &&
          selected.databaseId &&
          selected.inactiveLifeThreateningDiagnoses?.length ? (
            <section className="dp-record-section health-card-section diagnosis-history">
              <h3>{t("doctor.health.diagnosis.historyTitle")}</h3>
              <p>{t("doctor.health.diagnosis.historyDescription")}</p>
              {selected.inactiveLifeThreateningDiagnoses.map((diagnosis) => (
                <article key={diagnosis.id}>
                  <strong>{diagnosis.name}</strong>
                  <span>
                    {diagnosis.codeSystem === "other" &&
                    diagnosis.otherCodeSystemName
                      ? diagnosis.otherCodeSystemName
                      : t(
                          `doctor.health.codeSystem.${diagnosis.codeSystem}` as TranslationKey,
                        )}{" "}
                    · {diagnosis.code}
                  </span>
                  <small>
                    {t("doctor.health.verifiedBy", {
                      name: diagnosis.verifiedByName,
                      code: diagnosis.verifiedByCode,
                      date: formatDateTime(language, diagnosis.verifiedAt),
                    })}
                  </small>
                  <DiagnosisMutationForm
                    key={`${diagnosis.id}:${diagnosis.verifiedAt}`}
                    patientId={selected.databaseId!}
                    diagnosis={diagnosis}
                    isActive={false}
                    updateAction={updateLifeThreateningDiagnosisAction}
                    deactivateAction={deactivateLifeThreateningDiagnosisAction}
                    reactivateAction={reactivateLifeThreateningDiagnosisAction}
                    t={t}
                  />
                </article>
              ))}
            </section>
          ) : null}
        {!selected.allergyKeys.includes("noneKnown") && <div className="dp-allergy-alert"><strong>{t("doctor.allergyAlert")}</strong><span>{selected.allergyKeys.map((key) => t(medicalKey.allergy(key))).join(" · ")}</span></div>}
        <section className="dp-record-section"><h3>{t("common.conditions")}</h3><div className="dp-record-tags">{selected.conditionKeys.map((key) => <span key={key}>{t(medicalKey.condition(key))}</span>)}</div>
          {selected.canEdit && selected.conditionRecords?.[0] && <ConditionNoteForm record={selected.conditionRecords[0]} action={updateConditionNoteAction} t={t} />}
        </section>
        <section className="dp-record-section"><h3>{t("doctor.currentMedications")}</h3>{selected.medications.map((medication) => <div className="dp-med-row" key={medication.name}><span aria-hidden="true">Rx</span><strong>{medication.name}{medication.dose && ` ${medication.dose}`}</strong></div>)}</section>
        <section className="dp-record-section health-card-section">
          <h3>{t("doctor.health.familyDoctor.title")}</h3>
          {selected.familyDoctor ? <dl className="dp-health-grid">
            <div><dt>{t("doctor.health.familyDoctor.name")}</dt><dd>{selected.familyDoctor.name}</dd></div>
            <div><dt>{t("doctor.health.familyDoctor.code")}</dt><dd>{selected.familyDoctor.professionalCode ?? t("common.notRecorded")}</dd></div>
            <div><dt>{t("doctor.health.familyDoctor.telephone")}</dt><dd>{selected.familyDoctor.telephone ?? t("common.notRecorded")}</dd></div>
          </dl> : <p>{t("common.notRecorded")}</p>}
        </section>
        {selected.canEdit && selected.databaseId && <HealthCardProfileForm
          key={`${selected.databaseId}:${selected.lastReview}`}
          patient={selected}
          patientId={selected.databaseId}
          action={updateHealthCardProfileAction}
          t={t}
        />}
        <section className="dp-record-section health-card-section">
          <h3>{t("doctor.health.emergencyContacts.title")}</h3>
          {selected.emergencyContacts?.length ? selected.emergencyContacts.slice(0, 2).map((contact, index) => <article className="dp-health-contact" key={contact.id}>
            <strong>{t("doctor.health.emergencyContacts.number", { number: index + 1 })}: {contact.name}</strong>
            <span>{contact.relationship === "husband" ? t("medical.relationship.husband") : t("medical.relationship.other")}</span>
            <a href={`tel:${contact.telephone}`}>{contact.telephone}</a>
          </article>) : <p>{t("common.notRecorded")}</p>}
        </section>
        {selected.profileVerification && <section className="dp-record-section health-card-section">
          <h3>{t("doctor.health.profileVerification.title")}</h3>
          <p>{t("doctor.health.verifiedBy", {
            name: selected.profileVerification.clinicianName,
            code: selected.profileVerification.clinicianCode,
            date: formatDateTime(language, selected.profileVerification.verifiedAt),
          })}</p>
        </section>}
        {selected.canEdit && selected.databaseId && <SensitiveIdentifiersSection
          key={selected.databaseId}
          patientId={selected.databaseId}
          readAction={readSensitiveIdentifiersAction}
          updateAction={updateSensitiveIdentifiersAction}
          t={t}
          language={language}
        />}
        <section className="dp-record-section"><h3>{t("doctor.lastClinicalReview")}</h3><p>{formatDate(language, selected.lastReview)} · {initialData.clinician.name}</p></section>
        <div className="dp-drawer-actions"><button onClick={() => flash("notice.noteOpened")}>{t("doctor.addClinicalNote")}</button><button onClick={() => { flash("notice.profileReviewed", { name: selected.name }); setSelectedPatientId(null); }}>{t("doctor.markReviewed")}</button></div>
        <small className="dp-audit-note">{t("doctor.auditNote")}</small>
      </aside></div>}
      {notice && <div className="dp-toast" role="status">✓ {notice}</div>}
    </main>
  );
}

function useSingleFlightSubmit(
  pending: boolean,
  completionState: string,
) {
  const requestInFlight = useRef(false);
  useEffect(() => {
    if (!pending) requestInFlight.current = false;
  }, [completionState, pending]);
  return (event: React.FormEvent<HTMLFormElement>) => {
    if (requestInFlight.current) {
      event.preventDefault();
      return;
    }
    requestInFlight.current = true;
  };
}

function useRefreshingMutation(
  action: HealthMutationAction,
  onSaved?: () => void,
) {
  const router = useRouter();
  return useActionState(
    async (state: HealthDataMutationState, formData: FormData) => {
      const result = await action(state, formData);
      if (result.status === "saved") {
        onSaved?.();
        router.refresh();
      }
      return result;
    },
    initialHealthMutationState,
  );
}

function MutationFeedback({
  state,
  t,
}: {
  state: HealthDataMutationState;
  t: Translator;
}) {
  if (state.status === "idle") return null;
  return <p
    className={state.status === "saved" ? "note-success" : "note-error"}
    role="status"
  >
    {t(`doctor.health.form.${state.status}` as TranslationKey)}
  </p>;
}

function HealthCardProfileForm({
  patient,
  patientId,
  action,
  t,
}: {
  patient: Patient;
  patientId: string;
  action: HealthMutationAction;
  t: Translator;
}) {
  const [state, formAction, pending] = useRefreshingMutation(
    action,
  );
  const onSubmit = useSingleFlightSubmit(pending, state.status);

  return <section className="dp-record-section health-data-form">
    <h3>{t("doctor.health.form.profileTitle")}</h3>
    <form action={formAction} onSubmit={onSubmit}>
      <input type="hidden" name="patientId" value={patientId} />
      <div className="dp-health-grid">
        <label>{t("doctor.health.familyName")}<input name="familyName" defaultValue={patient.familyName ?? ""} /></label>
        <label>{t("doctor.health.givenNames")}<input name="givenNames" defaultValue={patient.givenNames ?? ""} /></label>
        <label>{t("doctor.health.insurance.status")}<select name="insuranceStatus" defaultValue={patient.insuranceStatus ?? "unknown"}>
          {(["unknown", "insured", "uninsured", "verification_pending"] as const).map((status) => <option value={status} key={status}>{t(`doctor.health.insurance.status.${status}` as TranslationKey)}</option>)}
        </select></label>
        <label>{t("doctor.health.insurance.source")}<select name="insuranceVerificationSource" defaultValue={patient.insuranceVerificationSource ?? "not_verified"}>
          {(["not_verified", "cnas_manual_check", "health_card", "supporting_document", "clinician_attestation"] as const).map((source) => <option value={source} key={source}>{t(`doctor.health.insurance.source.${source}` as TranslationKey)}</option>)}
        </select></label>
        <label>{t("doctor.health.insurance.houseCode")}<input name="insuranceHouseCode" defaultValue={patient.insuranceHouseCode ?? ""} /></label>
        <label>{t("doctor.health.insurance.houseName")}<input name="insuranceHouseName" defaultValue={patient.insuranceHouseName ?? ""} /></label>
        <label>{t("doctor.health.familyDoctor.name")}<input name="familyDoctorName" defaultValue={patient.familyDoctor?.name ?? ""} /></label>
        <label>{t("doctor.health.familyDoctor.code")}<input name="familyDoctorProfessionalCode" defaultValue={patient.familyDoctor?.professionalCode ?? ""} /></label>
        <label>{t("doctor.health.familyDoctor.telephone")}<input name="familyDoctorTelephone" type="tel" defaultValue={patient.familyDoctor?.telephone ?? ""} /></label>
      </div>
      <MutationFeedback state={state} t={t} />
      <button type="submit" disabled={pending}>{t(pending ? "doctor.health.form.saving" : "doctor.health.form.save")}</button>
    </form>
  </section>;
}

function DiagnosisFields({
  diagnosis,
  t,
}: {
  diagnosis?: NonNullable<Patient["lifeThreateningDiagnoses"]>[number];
  t: Translator;
}) {
  return <div className="diagnosis-fields">
    <label>{t("doctor.health.diagnosis.name")}<input name="name" required minLength={2} maxLength={240} defaultValue={diagnosis?.name ?? ""} /></label>
    <label>{t("doctor.health.diagnosis.codeSystem")}<select name="codeSystem" defaultValue={diagnosis?.codeSystem ?? "icd10"}>
      {(["icd10", "snomed_ct", "other"] as const).map((system) => <option key={system} value={system}>{t(`doctor.health.codeSystem.${system}` as TranslationKey)}</option>)}
    </select></label>
    <label>{t("doctor.health.diagnosis.code")}<input name="code" required maxLength={80} defaultValue={diagnosis?.code ?? ""} /></label>
    <label>{t("doctor.health.diagnosis.otherSystem")}<input name="otherCodeSystemName" maxLength={120} defaultValue={diagnosis?.otherCodeSystemName ?? ""} /></label>
  </div>;
}

function DiagnosisCreateForm({
  patientId,
  action,
  t,
}: {
  patientId: string;
  action: HealthMutationAction;
  t: Translator;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useRefreshingMutation(
    action,
    () => formRef.current?.reset(),
  );
  const onSubmit = useSingleFlightSubmit(pending, state.status);
  return <form ref={formRef} className="diagnosis-form" action={formAction} onSubmit={onSubmit}>
    <h4>{t("doctor.health.diagnosis.add")}</h4>
    <input type="hidden" name="patientId" value={patientId} />
    <DiagnosisFields t={t} />
    <MutationFeedback state={state} t={t} />
    <button type="submit" disabled={pending}>{t(pending ? "doctor.health.form.saving" : "doctor.health.diagnosis.add")}</button>
  </form>;
}

function DiagnosisMutationForm({
  patientId,
  diagnosis,
  isActive,
  updateAction,
  deactivateAction,
  reactivateAction,
  t,
}: {
  patientId: string;
  diagnosis: NonNullable<Patient["lifeThreateningDiagnoses"]>[number];
  isActive: boolean;
  updateAction: HealthMutationAction;
  deactivateAction: HealthMutationAction;
  reactivateAction: HealthMutationAction;
  t: Translator;
}) {
  const [updateState, updateFormAction, updatePending] =
    useRefreshingMutation(
    updateAction,
  );
  const [deactivateState, deactivateFormAction, deactivatePending] =
    useRefreshingMutation(deactivateAction);
  const [reactivateState, reactivateFormAction, reactivatePending] =
    useRefreshingMutation(reactivateAction);
  const onUpdate = useSingleFlightSubmit(updatePending, updateState.status);
  const onDeactivate = useSingleFlightSubmit(
    deactivatePending,
    deactivateState.status,
  );
  const onReactivate = useSingleFlightSubmit(
    reactivatePending,
    reactivateState.status,
  );

  return <div className="diagnosis-editor">
    <form action={updateFormAction} onSubmit={onUpdate}>
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="diagnosisId" value={diagnosis.id} />
      <DiagnosisFields diagnosis={diagnosis} t={t} />
      <MutationFeedback state={updateState} t={t} />
      <button type="submit" disabled={updatePending}>{t(updatePending ? "doctor.health.form.saving" : "doctor.health.form.save")}</button>
    </form>
    {isActive ? (
      <form action={deactivateFormAction} onSubmit={onDeactivate}>
        <input type="hidden" name="diagnosisId" value={diagnosis.id} />
        <label className="diagnosis-confirmation">
          <input type="checkbox" name="confirmed" value="yes" required />
          {t("doctor.health.diagnosis.deactivateConfirmation")}
        </label>
        <MutationFeedback state={deactivateState} t={t} />
        <button className="danger-button" type="submit" disabled={deactivatePending}>{t(deactivatePending ? "doctor.health.form.saving" : "doctor.health.diagnosis.deactivate")}</button>
      </form>
    ) : (
      <form action={reactivateFormAction} onSubmit={onReactivate}>
        <input type="hidden" name="diagnosisId" value={diagnosis.id} />
        <MutationFeedback state={reactivateState} t={t} />
        <button type="submit" disabled={reactivatePending}>{t(reactivatePending ? "doctor.health.form.saving" : "doctor.health.diagnosis.reactivate")}</button>
      </form>
    )}
  </div>;
}

function SensitiveIdentifiersSection({
  patientId,
  readAction,
  updateAction,
  t,
  language,
}: {
  patientId: string;
  readAction: (patientId: string) => Promise<SensitiveIdentifierReadResult>;
  updateAction: HealthMutationAction;
  t: Translator;
  language: Language;
}) {
  const [identifiers, setIdentifiers] = useState<
    Extract<SensitiveIdentifierReadResult, { ok: true }>["identifiers"] | null
  >(null);
  const [error, setError] = useState<"unauthorized" | "unavailable" | null>(null);
  const [pending, setPending] = useState(false);
  const requestInFlight = useRef(false);
  const [updateState, updateFormAction, updatePending] =
    useRefreshingMutation(
    updateAction,
    () => {
      setIdentifiers(null);
      setError(null);
    },
  );
  const onUpdateSubmit = useSingleFlightSubmit(
    updatePending,
    updateState.status,
  );

  const reveal = async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await readAction(patientId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIdentifiers(result.identifiers);
    } catch {
      setError("unavailable");
    } finally {
      requestInFlight.current = false;
      setPending(false);
    }
  };

  const hide = () => {
    setIdentifiers(null);
    setError(null);
  };
  const value = (identifier: string | null) =>
    identifiers ? identifier ?? t("common.notRecorded") : "••••••••";

  return <section className="dp-record-section sensitive-identifiers">
    <h3>{t("doctor.health.sensitive.title")}</h3>
    <p>{t("doctor.health.sensitive.description")}</p>
    <dl className="dp-health-grid">
      <div><dt>{t("doctor.health.sensitive.cnp")}</dt><dd>{value(identifiers?.cnp ?? null)}</dd></div>
      <div><dt>{t("doctor.health.sensitive.insuranceNumber")}</dt><dd>{value(identifiers?.insuranceNumber ?? null)}</dd></div>
      <div><dt>{t("doctor.health.sensitive.cardNumber")}</dt><dd>{value(identifiers?.healthCardNumber ?? null)}</dd></div>
      <div><dt>{t("doctor.health.sensitive.cardExpires")}</dt><dd>{identifiers?.healthCardExpiresAt ? formatDate(language, identifiers.healthCardExpiresAt) : value(null)}</dd></div>
    </dl>
    {identifiers?.verifiedAt && identifiers.verifiedByName && identifiers.verifiedByCode && <p>{t("doctor.health.verifiedBy", {
      name: identifiers.verifiedByName,
      code: identifiers.verifiedByCode,
      date: formatDateTime(language, identifiers.verifiedAt),
    })}</p>}
    {identifiers && <form className="sensitive-update-form" action={updateFormAction} onSubmit={onUpdateSubmit}>
      <input type="hidden" name="patientId" value={patientId} />
      <label>{t("doctor.health.sensitive.cnp")}<input name="cnp" inputMode="numeric" pattern="[0-9]{13}" defaultValue={identifiers.cnp ?? ""} /></label>
      <label>{t("doctor.health.sensitive.insuranceNumber")}<input name="insuranceNumber" defaultValue={identifiers.insuranceNumber ?? ""} /></label>
      <label>{t("doctor.health.sensitive.cardNumber")}<input name="healthCardNumber" defaultValue={identifiers.healthCardNumber ?? ""} /></label>
      <label>{t("doctor.health.sensitive.cardExpires")}<input type="date" name="healthCardExpiresAt" defaultValue={identifiers.healthCardExpiresAt ?? ""} /></label>
      <MutationFeedback state={updateState} t={t} />
      <button type="submit" disabled={updatePending}>{t(updatePending ? "doctor.health.form.saving" : "doctor.health.form.save")}</button>
    </form>}
    {error && <p className="note-error" role="alert">{t(error === "unavailable" ? "doctor.health.sensitive.unavailable" : "doctor.health.sensitive.unauthorized")}</p>}
    <button type="button" disabled={pending} onClick={identifiers ? hide : reveal}>
      {t(pending ? "doctor.health.sensitive.loading" : identifiers ? "doctor.health.sensitive.hide" : "doctor.health.sensitive.reveal")}
    </button>
  </section>;
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
