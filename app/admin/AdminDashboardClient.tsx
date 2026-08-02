"use client";

import Link from "next/link";
import { useActionState } from "react";
import { formatDate, formatDateTime, translate, type Language, type TranslationKey } from "@/app/i18n";
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
import {
  adminLogoutAction,
  createAdminClinicLocationAction,
  createAdminDoctorInvitationAction,
  setAccountingAccessAction,
  setAdminDoctorLocationAssignmentAction,
  updateAdminPatientAccountAction,
  updateAdminClinicLocationAction,
  updateAdminDoctorAction,
  type AdminClinicState,
  type AdminDoctorInvitationState,
  type AdminDoctorUpdateState,
  type AdminPatientState,
} from "./actions";

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
          {section === "doctors" && <DoctorAdminView data={data} t={t} language={language} />}
          {section === "patients" && <PatientAdminView data={data} t={t} language={language} />}
          {section === "clinics" && <ClinicAdminView data={data} t={t} language={language} />}
          {section === "organizations" && <AdminTable headers={[t("admin.table.name"), t("admin.table.clinics"), t("admin.table.status"), t("admin.table.created")]} rows={data.clinicManagers.map((row) => [row.displayName, String(row.clinicCount), t(administratorStatusKey(row.status)), formatDateTime(language, row.createdAt)])} empty={t("admin.empty.organizations")} />}
          {section === "managers" && <ManagersView data={data} t={t} language={language} />}
          {(["specialties", "reviews", "sms", "contracts", "privacy", "security"] as AdminSection[]).includes(section) && <PlannedView t={t} />}
        </div>
      </section>
    </main>
  );
}

const initialDoctorInvitationState: AdminDoctorInvitationState = { status: "idle" };
const initialDoctorUpdateState: AdminDoctorUpdateState = { status: "idle" };
const initialClinicState: AdminClinicState = { status: "idle" };
const initialPatientState: AdminPatientState = { status: "idle" };

function DoctorAdminView({ data, t, language }: { data: AdminDashboardData; t: (key: TranslationKey) => string; language: Language }) {
  const [invitationState, invitationAction, invitationPending] = useActionState(
    createAdminDoctorInvitationAction,
    initialDoctorInvitationState,
  );
  return <div className="admin-doctor-workspace">
    <details className="admin-doctor-invite" open>
      <summary><span><strong>{t("admin.doctor.invite.title")}</strong><small>{t("admin.doctor.invite.description")}</small></span><b>+</b></summary>
      <form action={invitationAction}>
        <label>{t("admin.doctor.invite.email")}<input name="email" type="email" required autoComplete="email" /></label>
        <label>{t("admin.doctor.invite.freeAccess")}<select name="freeAccessMonths" defaultValue="0"><option value="0">{t("admin.doctor.free.none")}</option><option value="3">{t("admin.doctor.free.3")}</option><option value="6">{t("admin.doctor.free.6")}</option><option value="12">{t("admin.doctor.free.12")}</option></select></label>
        <label>{t("admin.doctor.invite.language")}<select name="language" defaultValue={language}><option value="en">{t("language.en")}</option><option value="de">{t("language.de")}</option><option value="ro">{t("language.ro")}</option><option value="hu">{t("language.hu")}</option></select></label>
        <PendingSubmitButton type="submit" disabled={invitationPending}>{t(invitationPending ? "admin.doctor.invite.sending" : "admin.doctor.invite.submit")}</PendingSubmitButton>
        {invitationState.status !== "idle" && <p className={invitationState.status === "created" ? "note-success" : "note-error"} role="status">{t(`admin.doctor.invite.status.${invitationState.status}` as TranslationKey)}</p>}
        {invitationState.link && <p className="admin-invitation-link"><Link href={invitationState.link}>{invitationState.link}</Link></p>}
      </form>
      {data.doctorInvitations.length > 0 && <div className="admin-invitation-history"><h3>{t("admin.doctor.invite.history")}</h3>{data.doctorInvitations.slice(0, 10).map((invitation) => <div key={invitation.id}><span><strong>{invitation.email}</strong><small>{formatDateTime(language, invitation.createdAt)}</small></span><b>{t(`admin.doctor.invitationStatus.${invitation.status}` as TranslationKey)}</b><em>{invitation.freeAccessMonths ? t(`admin.doctor.free.${invitation.freeAccessMonths}` as TranslationKey) : t("admin.doctor.free.none")}</em></div>)}</div>}
    </details>

    <div className="admin-doctor-list">
      {data.clinicians.length ? data.clinicians.map((doctor) => <DoctorAdminRow key={doctor.id} doctor={doctor} t={t} language={language} />) : <p className="admin-empty">{t("admin.empty.doctors")}</p>}
    </div>
  </div>;
}

function DoctorAdminRow({ doctor, t, language }: { doctor: AdminDashboardData["clinicians"][number]; t: (key: TranslationKey) => string; language: Language }) {
  const [state, action, pending] = useActionState(updateAdminDoctorAction, initialDoctorUpdateState);
  return <details className="admin-doctor-row">
    <summary>
      <span className="admin-doctor-avatar">{doctor.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
      <span><strong>{doctor.fullName}</strong><small>{doctor.email || t("admin.doctor.noEmail")}</small></span>
      <span><strong>{t(clinicianSpecialtyKey(doctor.specialty))}</strong><small>{doctor.professionalIdentifier}</small></span>
      <span><strong>{doctor.payerName}</strong><small>{t(doctor.payerKind === "clinic" ? "billing.clinic" : "billing.independentDoctor")}</small></span>
      <b className={`admin-doctor-status ${doctor.status}`}>{t(clinicianStatusKey(doctor.status))}</b>
    </summary>
    <div className="admin-doctor-detail">
      <form action={action}>
        <input type="hidden" name="clinicianId" value={doctor.id} />
        <label>{t("admin.table.name")}<input name="fullName" defaultValue={doctor.fullName} required minLength={2} maxLength={160} /></label>
        <label>{t("admin.table.specialty")}<input name="specialty" defaultValue={doctor.specialty} required minLength={2} maxLength={120} /></label>
        <label>{t("admin.table.identifier")}<input name="professionalIdentifier" defaultValue={doctor.professionalIdentifier} required minLength={3} maxLength={80} /></label>
        <label>{t("admin.table.clinic")}<input name="clinicName" defaultValue={doctor.clinicName} required minLength={2} maxLength={160} /></label>
        <label>{t("register.country")}<input name="clinicCountry" defaultValue={doctor.clinicCountry} required pattern="[A-Za-z]{2}" maxLength={2} /></label>
        <label>{t("admin.table.status")}<select name="verificationStatus" defaultValue={doctor.status}><option value="pending">{t("admin.status.pending")}</option><option value="approved">{t("admin.status.approved")}</option><option value="suspended">{t("admin.status.suspended")}</option><option value="rejected">{t("admin.status.rejected")}</option></select></label>
        <label className="admin-doctor-reason">{t("admin.doctor.statusReason")}<textarea name="statusReason" maxLength={500} rows={2} placeholder={t("admin.doctor.statusReasonHelp")} /></label>
        <PendingSubmitButton type="submit" disabled={pending}>{t(pending ? "admin.doctor.saving" : "admin.doctor.save")}</PendingSubmitButton>
        {state.status !== "idle" && <p className={state.status === "saved" ? "note-success" : "note-error"} role="status">{t(`admin.doctor.update.${state.status}` as TranslationKey)}</p>}
      </form>
      <aside>
        <section><h3>{t("admin.doctor.clinicAssociations")}</h3>{doctor.clinics.length ? doctor.clinics.map((clinic) => <p key={clinic.id}><strong>{clinic.name}</strong><span>{t(administratorStatusKey(clinic.status))}</span></p>) : <small>{t("admin.doctor.noClinicAssociations")}</small>}</section>
        <section><h3>{t("admin.doctor.freeAccess")}</h3>{doctor.freeAccess.length ? doctor.freeAccess.map((period) => <p key={`${period.startsOn}-${period.endsBefore}`}><strong>{formatDate(language, period.startsOn)} – {formatDate(language, period.endsBefore)}</strong><span>{t(`admin.doctor.free.${period.months}` as TranslationKey)}</span></p>) : <small>{t("admin.doctor.free.noneActive")}</small>}</section>
        <section><h3>{t("admin.doctor.statusHistory")}</h3>{doctor.statusHistory.length ? doctor.statusHistory.slice(0, 5).map((history) => <p key={history.changedAt}><strong>{t(clinicianStatusKey(history.newStatus))}</strong><span>{formatDateTime(language, history.changedAt)}{history.reason ? ` · ${history.reason}` : ""}</span></p>) : <small>{t("admin.doctor.noStatusHistory")}</small>}</section>
      </aside>
    </div>
  </details>;
}

function ClinicAdminView({ data, t, language }: { data: AdminDashboardData; t: (key: TranslationKey) => string; language: Language }) {
  const [state, action, pending] = useActionState(createAdminClinicLocationAction, initialClinicState);
  return <div className="admin-clinic-workspace">
    <details className="admin-doctor-invite admin-clinic-create">
      <summary><span><strong>{t("admin.clinic.add.title")}</strong><small>{t("admin.clinic.add.description")}</small></span><b>+</b></summary>
      <form action={action}>
        <label>{t("admin.clinic.organization")}<select name="clinicId" required defaultValue=""><option value="" disabled>{t("admin.clinic.selectOrganization")}</option>{data.clinicOrganizations.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.displayName} · {t(administratorStatusKey(clinic.status))}</option>)}</select></label>
        <label>{t("admin.clinic.locationName")}<input name="displayName" required minLength={2} maxLength={160} /></label>
        <label>{t("workspace.country")}<input name="countryCode" defaultValue="RO" required maxLength={2} /></label>
        <label>{t("admin.table.status")}<select name="locationStatus" defaultValue="pending"><option value="pending">{t("admin.status.pending")}</option><option value="active">{t("admin.status.active")}</option><option value="suspended">{t("admin.status.suspended")}</option><option value="rejected">{t("admin.status.rejected")}</option></select></label>
        <label>{t("workspace.city")}<input name="city" maxLength={120} /></label>
        <label>{t("workspace.address")}<input name="address" maxLength={240} /></label>
        <label>{t("workspace.latitude")}<input name="latitude" type="number" step="any" /></label>
        <label>{t("workspace.longitude")}<input name="longitude" type="number" step="any" /></label>
        <label>{t("admin.clinic.activeFrom")}<input name="activeFrom" type="date" /></label>
        <label>{t("admin.clinic.endsBefore")}<input name="endsBefore" type="date" /></label>
        <input type="hidden" name="description" value="" /><input type="hidden" name="publicPhone" value="" /><input type="hidden" name="publicEmail" value="" />
        <PendingSubmitButton type="submit" disabled={pending}>{t(pending ? "admin.clinic.saving" : "admin.clinic.add.submit")}</PendingSubmitButton>
        <ClinicResult state={state} t={t} />
      </form>
    </details>
    <div className="admin-clinic-list">{data.clinics.length ? data.clinics.map((location) => <ClinicAdminRow key={location.id} location={location} doctors={data.clinicians} t={t} language={language} />) : <p className="admin-empty">{t("admin.empty.clinics")}</p>}</div>
  </div>;
}

function ClinicAdminRow({ location, doctors, t, language }: { location: AdminDashboardData["clinics"][number]; doctors: AdminDashboardData["clinicians"]; t: (key: TranslationKey) => string; language: Language }) {
  const [updateState, updateAction, updatePending] = useActionState(updateAdminClinicLocationAction, initialClinicState);
  const [assignmentState, assignmentAction, assignmentPending] = useActionState(setAdminDoctorLocationAssignmentAction, initialClinicState);
  return <details className="admin-clinic-row">
    <summary><span><strong>{location.displayName}</strong><small>{location.organizationName}</small></span><span><strong>{[location.city, location.countryCode].filter(Boolean).join(", ") || "—"}</strong><small>{location.address || t("admin.clinic.addressMissing")}</small></span><span><strong>{location.assignments.filter((item) => item.status === "active").length}</strong><small>{t("admin.table.doctors")}</small></span><b className={`admin-doctor-status ${location.status}`}>{t(administratorStatusKey(location.status))}</b></summary>
    <div className="admin-clinic-detail">
      <form action={updateAction} className="admin-clinic-form">
        <input type="hidden" name="locationId" value={location.id} />
        <label>{t("admin.clinic.organization")}<input value={location.organizationName} readOnly /></label>
        <label>{t("admin.clinic.locationName")}<input name="displayName" defaultValue={location.displayName} required /></label>
        <label>{t("workspace.country")}<input name="countryCode" defaultValue={location.countryCode} required maxLength={2} /></label>
        <label>{t("admin.table.status")}<select name="locationStatus" defaultValue={location.status}><option value="pending">{t("admin.status.pending")}</option><option value="active">{t("admin.status.active")}</option><option value="suspended">{t("admin.status.suspended")}</option><option value="rejected">{t("admin.status.rejected")}</option></select></label>
        <label className="admin-clinic-wide">{t("workspace.description")}<textarea name="description" rows={3} defaultValue={location.description} /></label>
        <label>{t("workspace.phone")}<input name="publicPhone" defaultValue={location.publicPhone} /></label><label>{t("workspace.email")}<input name="publicEmail" type="email" defaultValue={location.publicEmail} /></label>
        <label>{t("workspace.city")}<input name="city" defaultValue={location.city} /></label><label>{t("workspace.address")}<input name="address" defaultValue={location.address} /></label>
        <label>{t("workspace.latitude")}<input name="latitude" type="number" step="any" defaultValue={location.latitude ?? ""} /></label><label>{t("workspace.longitude")}<input name="longitude" type="number" step="any" defaultValue={location.longitude ?? ""} /></label>
        <label>{t("admin.clinic.activeFrom")}<input name="activeFrom" type="date" defaultValue={location.activeFrom} /></label><label>{t("admin.clinic.endsBefore")}<input name="endsBefore" type="date" defaultValue={location.endsBefore} /></label>
        <label className="admin-clinic-wide">{t("admin.clinic.statusReason")}<textarea name="statusReason" rows={2} maxLength={500} /></label>
        <PendingSubmitButton type="submit" disabled={updatePending}>{t(updatePending ? "admin.clinic.saving" : "admin.clinic.save")}</PendingSubmitButton><ClinicResult state={updateState} t={t} />
      </form>
      <aside>
        <section><h3>{t("admin.clinic.assign.title")}</h3><p>{t("admin.clinic.assign.description")}</p><form action={assignmentAction} className="admin-assignment-form"><input type="hidden" name="locationId" value={location.id} /><label>{t("admin.table.doctor")}<select name="clinicianId" required defaultValue=""><option value="" disabled>{t("admin.clinic.assign.selectDoctor")}</option>{doctors.filter((doctor) => doctor.status === "approved").map((doctor) => <option value={doctor.id} key={doctor.id}>{doctor.fullName}</option>)}</select></label><label>{t("admin.table.status")}<select name="assignmentStatus" defaultValue="active"><option value="active">{t("admin.status.active")}</option><option value="suspended">{t("admin.status.suspended")}</option><option value="ended">{t("admin.clinic.assignment.ended")}</option></select></label><label>{t("admin.clinic.activeFrom")}<input name="startsOn" type="date" /></label><label>{t("admin.clinic.endsBefore")}<input name="endsBefore" type="date" /></label><PendingSubmitButton disabled={assignmentPending}>{t(assignmentPending ? "admin.clinic.saving" : "admin.clinic.assign.submit")}</PendingSubmitButton><ClinicResult state={assignmentState} t={t} /></form></section>
        <section><h3>{t("admin.clinic.assignedDoctors")}</h3>{location.assignments.length ? location.assignments.map((assignment) => <p key={assignment.id}><strong>{assignment.doctorName}</strong><span>{t(`admin.clinic.assignment.${assignment.status}` as TranslationKey)} · {assignment.startsOn ? formatDate(language, assignment.startsOn) : "—"}{assignment.endsBefore ? ` – ${formatDate(language, assignment.endsBefore)}` : ""}</span></p>) : <small>{t("admin.clinic.noAssignedDoctors")}</small>}</section>
        <section><h3>{t("admin.clinic.statusHistory")}</h3>{location.statusHistory.length ? location.statusHistory.slice(0, 5).map((history) => <p key={history.changedAt}><strong>{t(administratorStatusKey(history.newStatus))}</strong><span>{formatDateTime(language, history.changedAt)}{history.reason ? ` · ${history.reason}` : ""}</span></p>) : <small>{t("admin.clinic.noStatusHistory")}</small>}</section>
      </aside>
    </div>
  </details>;
}

function ClinicResult({ state, t }: { state: AdminClinicState; t: (key: TranslationKey) => string }) {
  if (state.status === "idle") return null;
  return <p className={state.status === "created" || state.status === "saved" ? "note-success" : "note-error"} role="status">{t(`admin.clinic.result.${state.status}` as TranslationKey)}</p>;
}

function PatientAdminView({ data, t, language }: { data: AdminDashboardData; t: (key: TranslationKey) => string; language: Language }) {
  return <div className="admin-patient-list">{data.patients.length ? data.patients.map((patient) => <PatientAdminRow key={patient.id} patient={patient} t={t} language={language} />) : <p className="admin-empty">{t("admin.empty.patients")}</p>}</div>;
}

function PatientAdminRow({ patient, t, language }: { patient: AdminDashboardData["patients"][number]; t: (key: TranslationKey) => string; language: Language }) {
  const [state, action, pending] = useActionState(updateAdminPatientAccountAction, initialPatientState);
  const effectiveStatus = patient.archivedAt ? "archived" : patient.accountStatus;
  return <details className="admin-patient-row">
    <summary>
      <span className="admin-doctor-avatar">{patient.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
      <span><strong>{patient.fullName}</strong><small>{patient.email || t("admin.patient.noEmail")}</small></span>
      <span><strong>{patient.vitapassId}</strong><small>{t("admin.table.vitapassId")}</small></span>
      <span><strong>{patient.lastSignInAt ? formatDateTime(language, patient.lastSignInAt) : t("admin.patient.neverSignedIn")}</strong><small>{t("admin.patient.lastSignIn")}</small></span>
      <b className={`admin-patient-status ${effectiveStatus}`}>{t(`admin.patient.status.${effectiveStatus}` as TranslationKey)}</b>
    </summary>
    <div className="admin-patient-detail">
      <form action={action}>
        <fieldset disabled={Boolean(patient.archivedAt) || pending}>
          <input type="hidden" name="patientId" value={patient.id} />
          <label>{t("admin.table.name")}<input name="fullName" defaultValue={patient.fullName} required minLength={2} maxLength={160} /></label>
          <label>{t("admin.patient.familyName")}<input name="familyName" defaultValue={patient.familyName} maxLength={100} /></label>
          <label>{t("admin.patient.givenNames")}<input name="givenNames" defaultValue={patient.givenNames} maxLength={140} /></label>
          <label>{t("admin.patient.phone")}<input name="accountPhone" type="tel" defaultValue={patient.accountPhone} maxLength={40} /></label>
          <label>{t("admin.patient.language")}<select name="preferredLanguage" defaultValue={patient.preferredLanguage || "ro"}><option value="en">{t("language.en")}</option><option value="de">{t("language.de")}</option><option value="ro">{t("language.ro")}</option><option value="hu">{t("language.hu")}</option></select></label>
          <label>{t("admin.table.status")}<select name="accountStatus" defaultValue={patient.accountStatus}><option value="active">{t("admin.patient.status.active")}</option><option value="suspended">{t("admin.patient.status.suspended")}</option><option value="blocked">{t("admin.patient.status.blocked")}</option></select></label>
          <label className="admin-patient-wide">{t("admin.patient.statusReason")}<textarea name="statusReason" rows={2} maxLength={500} defaultValue={patient.accountStatusReason} placeholder={t("admin.patient.statusReasonHelp")} /></label>
          <PendingSubmitButton type="submit" disabled={pending}>{t(pending ? "admin.patient.saving" : "admin.patient.save")}</PendingSubmitButton>
          {state.status !== "idle" && <p className={state.status === "saved" ? "note-success" : "note-error"} role="status">{t(`admin.patient.result.${state.status}` as TranslationKey)}</p>}
        </fieldset>
        {patient.archivedAt && <p className="note-error">{t("admin.patient.archivedHelp")}</p>}
      </form>
      <aside>
        <section><h3>{t("admin.patient.accountDetails")}</h3><p><strong>{patient.email || t("admin.patient.noEmail")}</strong><span>{patient.emailConfirmedAt ? t("admin.patient.emailConfirmed") : t("admin.patient.emailNotConfirmed")}</span></p><p><strong>{t("admin.patient.created")}</strong><span>{formatDateTime(language, patient.createdAt)}</span></p><p><strong>{t("admin.patient.lastSignIn")}</strong><span>{patient.lastSignInAt ? formatDateTime(language, patient.lastSignInAt) : t("admin.patient.neverSignedIn")}</span></p></section>
        <section><h3>{t("admin.patient.statusHistory")}</h3>{patient.statusHistory.length ? patient.statusHistory.slice(0, 6).map((history) => <p key={history.changedAt}><strong>{t(`admin.patient.status.${history.newStatus}` as TranslationKey)}</strong><span>{formatDateTime(language, history.changedAt)}{history.reason ? ` · ${history.reason}` : ""}</span></p>) : <small>{t("admin.patient.noStatusHistory")}</small>}</section>
        <section className="admin-patient-privacy"><h3>{t("admin.patient.medicalPrivacy")}</h3><p>{t("admin.patient.medicalPrivacyHelp")}</p></section>
      </aside>
    </div>
  </details>;
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
