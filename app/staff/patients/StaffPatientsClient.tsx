"use client";

import Link from "next/link";
import { translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { StaffMedicalProfile, StaffPatientListItem } from "@/lib/dal/staff-patients";

export default function StaffPatientsClient({
  patients,
  selected,
}: {
  patients: StaffPatientListItem[];
  selected: StaffMedicalProfile | null;
}) {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  if (!ready) return <main className="organization-shell" aria-busy="true" />;
  const list = (label: TranslationKey, values: string[]) => <section className="organization-card"><h3>{t(label)}</h3><p>{values.length ? values.join(" · ") : t("common.noneRecorded")}</p></section>;
  return <main className="organization-shell">
    <header className="organization-topbar">
      <strong>VitaPass</strong><Link href="/staff">{t("appointments.back")}</Link>
      <select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("a11y.languageSelector")}>
        <option value="en">{t("language.en")}</option><option value="de">{t("language.de")}</option><option value="ro">{t("language.ro")}</option><option value="hu">{t("language.hu")}</option>
      </select>
    </header>
    <section className="appointment-content">
      <p className="registration-kicker">{t("organization.staff.eyebrow")}</p>
      <h1>{t("staffPatients.title")}</h1>
      <p>{t("staffPatients.readOnly")}</p>
      <div className="staff-patient-layout">
        <nav className="organization-card">
          {patients.map((patient) => <Link key={patient.id} href={`/staff/patients?patient=${patient.id}`}><strong>{patient.fullName}</strong><small>{patient.vitapassId}</small></Link>)}
          {!patients.length && <p>{t("staffPatients.empty")}</p>}
        </nav>
        {selected && <div>
          <article className="organization-card"><h2>{selected.fullName}</h2><p>{selected.vitapassId} · {t("patient.dateOfBirth")}: {selected.dateOfBirth}</p><p>{t("patient.bloodGroup")}: {selected.bloodGroup} {selected.rhFactor} · {t("patient.sex")}: {selected.sex} · {t("patient.organDonor")}: {t(selected.organDonor ? "common.yes" : "common.no")}</p></article>
          {selected.diagnoses.length > 0 && list("doctor.health.lifeThreatening.title", selected.diagnoses)}
          {list("patient.allergies", selected.allergies)}
          {list("patient.section.medications", selected.medications)}
          {list("patient.chronicConditions", selected.conditions)}
          {list("patient.previousProcedures", selected.surgeries)}
          {list("patient.section.devices", selected.implants)}
          {list("patient.emergencyContact", selected.emergencyContacts.map((contact) => `${contact.name}: ${contact.phone}`))}
        </div>}
      </div>
    </section>
  </main>;
}
