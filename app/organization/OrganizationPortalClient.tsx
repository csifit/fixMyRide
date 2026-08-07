"use client";

import Link from "next/link";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type {
  ManagerDashboard,
  StaffDashboard,
} from "@/lib/dal/organization";
import InvitationForm from "./InvitationForm";
import MembershipControl from "./MembershipControl";

export default function OrganizationPortalClient({
  kind,
  displayName,
  dashboard,
  logoutAction,
}: {
  kind: "clinic_manager" | "staff";
  displayName: string;
  dashboard: ManagerDashboard | StaffDashboard;
  logoutAction: () => Promise<void>;
}) {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  if (!ready) return <main className="organization-shell" aria-busy="true" />;
  const managerDashboard = kind === "clinic_manager"
    ? dashboard as ManagerDashboard
    : null;
  const staffDashboard = kind === "staff" ? dashboard as StaffDashboard : null;

  return (
    <main className="organization-shell">
      <header className="organization-topbar">
        <strong>pitster</strong>
        <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label={t("a11y.languageSelector")}>
          <option value="en">{t("language.en")}</option><option value="de">{t("language.de")}</option><option value="ro">{t("language.ro")}</option><option value="hu">{t("language.hu")}</option>
        </select>
        <form action={logoutAction}><button>{t("auth.logout")}</button></form>
      </header>
      <section className="organization-content">
        <p className="registration-kicker">{t(`organization.${kind}.eyebrow` as TranslationKey)}</p>
        <h1>{t("organization.welcome").replace("{name}", displayName)}</h1>
        <p>{t(`organization.${kind}.securityNote` as TranslationKey)}</p>
        {kind === "clinic_manager" && <><Link className="organization-action" href="/workshop-manager/requests">{t("workshopBookings.title")}</Link><Link className="organization-action organization-action-spaced" href="/clinic-manager/clinics">{t("workspace.clinicsTitle")}</Link><Link className="organization-action organization-action-spaced" href="/clinic-manager/services">{t("serviceCatalogue.title")}</Link><Link className="organization-action organization-action-spaced" href="/clinic-manager/invoicing">{t("invoicing.title")}</Link></>}
        {kind === "staff" && <><Link className="organization-action" href="/staff/appointments">{t("appointments.title")}</Link><Link className="organization-action organization-action-spaced" href="/staff/patients">{t("staffPatients.title")}</Link></>}

        {managerDashboard?.clinics.map((clinic) => (
          <article className="organization-card" key={clinic.id}>
            <header><div><h2>{clinic.displayName}</h2><p>{clinic.legalName} · {clinic.countryCode}</p></div><b>{t(`organization.status.${clinic.status}` as TranslationKey)}</b></header>
            <dl><div><dt>{t("organization.membershipRole")}</dt><dd>{t(`organization.role.${clinic.membershipRole}` as TranslationKey)}</dd></div><div><dt>{t("organization.billingStatus")}</dt><dd>{t(`organization.billing.${clinic.billingStatus}` as TranslationKey)}</dd></div></dl>
            <h3>{t("organization.doctors")}</h3>
            <InvitationForm kind="clinic_doctor" clinicId={clinic.id} language={language} />
            {clinic.doctors.length ? clinic.doctors.map((doctor) => <div className="organization-row" key={doctor.id}><span><strong>{doctor.name}</strong><small>{doctor.specialty}</small></span><b>{t(`organization.membership.${doctor.status}` as TranslationKey)}</b><MembershipControl membershipId={doctor.membershipId} currentStatus={doctor.status} language={language} /></div>) : <p>{t("organization.doctorsEmpty")}</p>}
          </article>
        ))}
        {managerDashboard && !managerDashboard.clinics.length && <p className="organization-card">{t("organization.clinicsEmpty")}</p>}

        {staffDashboard?.doctors.map((doctor) => (
          <article className="organization-card" key={doctor.id}>
            <h2>{doctor.name}</h2><p>{doctor.specialty} · {doctor.clinicName}</p>
            <b>{t(`organization.membership.${doctor.status}` as TranslationKey)}</b>
          </article>
        ))}
        {staffDashboard && !staffDashboard.doctors.length && <p className="organization-card">{t("organization.assignmentsEmpty")}</p>}
      </section>
    </main>
  );
}
