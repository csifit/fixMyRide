"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PatientPortalData } from "./demo-data";
import {
  formatDate,
  formatDateTime,
  medicalKey,
  translate,
  type TranslationKey,
} from "./i18n";
import { useLanguage } from "./i18n/useLanguage";

type Section = "profile" | "share" | "access";

function MiniIcon({ children, alert = false }: { children: React.ReactNode; alert?: boolean }) {
  return <span className={`mini-icon ${alert ? "alert" : ""}`}>{children}</span>;
}

function QrCode({ label }: { label: string }) {
  const cells = useMemo(() => Array.from({ length: 121 }, (_, i) => {
    const x = i % 11, y = Math.floor(i / 11);
    return (x < 3 && y < 3) || (x > 7 && y < 3) || (x < 3 && y > 7) || ((x * 3 + y * 5 + x * y) % 7 < 3);
  }), []);
  return <div className="qr" role="img" aria-label={label}>{cells.map((on, i) => <i key={i} className={on ? "on" : ""} />)}</div>;
}

export default function PatientPortal({ data }: { data: PatientPortalData }) {
  const [language, setLanguage, languageReady] = useLanguage();
  const [section, setSection] = useState<Section>("profile");
  const [emergency, setEmergency] = useState(false);
  const [doctorModal, setDoctorModal] = useState(false);
  const [doctorMode, setDoctorMode] = useState(false);
  const [notice, setNotice] = useState("");
  const profile = data.profile;
  const t = (key: TranslationKey, params?: Record<string, string | number>) => translate(language, key, params);
  const flash = (key: TranslationKey, params?: Record<string, string | number>) => {
    setNotice(t(key, params));
    window.setTimeout(() => setNotice(""), 2600);
  };
  const nav = [
    { id: "profile" as const, icon: "♥", key: "patient.nav.profile" as const },
    { id: "share" as const, icon: "↗", key: "patient.nav.share" as const },
    { id: "access" as const, icon: "◷", key: "patient.nav.access" as const },
  ];
  const emergencyContacts = profile.emergencyContacts.slice(0, 2);
  const primaryEmergencyContact = emergencyContacts[0];
  const emergencyContact = primaryEmergencyContact
    ? `${primaryEmergencyContact.name} · ${
        primaryEmergencyContact.relationshipKey === "husband"
          ? t(medicalKey.relationship("husband"))
          : t("medical.relationship.other")
      }`
    : t("common.notRecorded");

  return (
    <main className={`${emergency ? "app emergency-theme" : "app"} ${languageReady ? "" : "i18n-pending"}`}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">+</span><span>VitaPass</span></div>
        <nav aria-label={t("a11y.patientMainNavigation")}>
          {nav.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><MiniIcon>{item.icon}</MiniIcon>{t(item.key)}</button>)}
        </nav>
        <div className="sidebar-foot">
          <Link className="patient-booking-link" href="/patient/appointments">◷ {t("patientAppointments.title")}</Link>
          <Link className="patient-booking-link" href="/appointments">⌕ {t("booking.findDoctor")}</Link>
          <button className="doctor-link" onClick={() => setDoctorModal(true)}><span className="status-dot" />{t("patient.doctorAccess")}<span>→</span></button>
          <div className="signed-in"><div className="avatar small">{profile.initials}</div><div><b>{profile.name}</b><span>{t("patient.signedInAsPatient")}</span></div><button onClick={() => flash("notice.demoSession")} aria-label={t("a11y.signOut")}>↗</button></div>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => setSection("profile")}><span className="brand-mark">+</span>VitaPass</button>
          <div className="top-actions">
            <label className="language"><span aria-hidden="true">◎</span><select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label={t("a11y.languageSelector")}>
              <option value="en">{t("language.en")}</option><option value="de">{t("language.de")}</option><option value="ro">{t("language.ro")}</option><option value="hu">{t("language.hu")}</option>
            </select></label>
            <button className="emergency-btn" onClick={() => setEmergency(!emergency)}><span>✣</span>{t("patient.emergencyMode")}</button>
            <button className="doctor-mobile" onClick={() => setDoctorModal(true)} aria-label={t("patient.doctorAccess")}>⚕</button>
          </div>
        </header>

        {section === "profile" && <div className="page">
          <div className="profile-head">
            <div className="avatar">{profile.initials}</div>
            <div><h1>{profile.name}</h1><p>{t("patient.dateOfBirth")} · {formatDate(language, profile.dateOfBirth)}</p><div className="badges"><span className="verified">✓ {t("patient.identityVerified")}</span><span className="readonly">⌕ {doctorMode ? t("patient.clinicianEditMode") : t("patient.readOnly")}</span></div></div>
            {doctorMode && <button className="save-btn" onClick={() => { setDoctorMode(false); flash("notice.recordSaved"); }}>{t("patient.action.saveSignedUpdate")}</button>}
          </div>
          <section className="critical-card">
            <div className="section-title"><MiniIcon alert>!</MiniIcon><div><h2>{t("patient.critical.title")}</h2><p>{t("patient.critical.help")}</p></div></div>
            <div className="critical-grid">
              <div><span>{t("patient.bloodGroup")}</span><strong className="blood">{profile.blood}</strong></div>
              <div><span>{t("patient.allergies")}</span><div className="tags">{profile.allergyKeys.map((key) => <strong key={key}>{t(medicalKey.allergy(key))}</strong>)}</div></div>
              <div><span>{t("patient.emergencyContact")}</span><strong>{emergencyContact}</strong>{primaryEmergencyContact && <a href={`tel:${primaryEmergencyContact.phone}`}>{primaryEmergencyContact.phone}</a>}</div>
            </div>
          </section>
          <div className="info-grid">
            <article className="card"><div className="section-title"><MiniIcon>○</MiniIcon><h2>{t("patient.section.personal")}</h2>{doctorMode && <span className="edit-chip">{t("patient.action.editable")}</span>}</div><dl>
              <div><dt>{t("patient.dateOfBirth")}</dt><dd>{formatDate(language, profile.dateOfBirth)}</dd></div><div><dt>{t("patient.sex")}</dt><dd>{t(medicalKey.sex(profile.sexKey))}</dd></div><div><dt>{t("patient.bloodGroup")}</dt><dd>{profile.blood}</dd></div><div><dt>{t("patient.organDonor")}</dt><dd><span className="yes">{t(profile.organDonor ? "common.yes" : "common.no")}</span></dd></div>
            </dl></article>
            <article className="card"><div className="section-title"><MiniIcon>✚</MiniIcon><h2>{t("patient.section.medications")}</h2>{doctorMode && <button className="add-btn">{t("patient.action.add")}</button>}</div><div className="med-list">{profile.medications.length ? profile.medications.map((medication) => <div className="med" key={medication.name}><span className="pill">◆</span><div><strong>{medication.name}</strong><p>{medication.dose} · {t(medicalKey.schedule(medication.scheduleKey))}</p></div></div>) : <p className="empty-state">{t("patient.medications.none")}</p>}</div></article>
            <article className="card"><div className="section-title"><MiniIcon>⌁</MiniIcon><h2>{t("patient.section.conditions")}</h2></div><div className="detail-block"><span>{t("patient.chronicConditions")}</span><div className="tags calm">{profile.conditionKeys.map((key) => <strong key={key}>{t(medicalKey.condition(key))}</strong>)}</div></div><div className="detail-block"><span>{t("patient.previousProcedures")}</span><strong>{profile.procedures.map((procedure) => `${t(medicalKey.procedure(procedure.key))} · ${procedure.year}`).join(", ") || t("common.noneRecorded")}</strong></div></article>
            <article className="card"><div className="section-title"><MiniIcon>◇</MiniIcon><h2>{t("patient.section.devices")}</h2></div><p className="empty-state"><span>✓</span>{profile.implantKeys.map((key) => t(medicalKey.implant(key))).join(", ") || t("patient.implants.none")}</p></article>
            <article className="card wide"><div className="section-title"><MiniIcon>♧</MiniIcon><h2>{t("patient.section.contacts")}</h2></div><div className="contact-grid">
              {emergencyContacts.map((contact, index) => <div key={`${contact.name}-${index}`}><span className="contact-avatar">EC</span><div><small>{t("patient.emergencyContact")} {index + 1}</small><strong>{contact.name} · {contact.relationshipKey === "husband" ? t(medicalKey.relationship("husband")) : t("medical.relationship.other")}</strong><a href={`tel:${contact.phone}`}>{contact.phone}</a></div></div>)}
              <div><span className="contact-avatar doctor">DR</span><div><small>{t("patient.familyDoctor")}</small><strong>{profile.doctor.name}</strong><a href={`tel:${profile.doctor.phone}`}>{profile.doctor.phone}</a></div></div>
            </div></article>
          </div>
          <p className="update-note">✓ {t("patient.lastUpdated")}: {formatDateTime(language, profile.lastUpdated)} · {profile.doctor.name}</p>
        </div>}

        {section === "share" && <div className="page narrow">
          <div className="page-intro"><span className="intro-icon">↗</span><div><h1>{t("patient.share.title")}</h1><p>{t("patient.share.description")}</p></div></div>
          <div className="share-layout"><article className="qr-card"><div className="qr-wrap"><QrCode label={t("a11y.temporaryQrCode")} /></div><h2>{t("patient.share.scan")}</h2><p>{t("patient.share.qrHelp")}</p><span className="countdown">14:52</span></article>
            <div className="share-options">
              <button onClick={() => flash("notice.nfcReady")}><MiniIcon>)))</MiniIcon><span><b>{t("patient.share.nfc")}</b><small>{t("patient.share.nfcHelp")}</small></span><i>→</i></button>
              <button onClick={() => flash("notice.emailReady")}><MiniIcon>@</MiniIcon><span><b>{t("patient.share.email")}</b><small>{t("patient.share.emailHelp")}</small></span><i>→</i></button>
              <button onClick={() => flash("notice.cardReady")}><MiniIcon>↓</MiniIcon><span><b>{t("patient.share.download")}</b><small>{t("patient.share.downloadHelp")}</small></span><i>→</i></button>
            </div>
          </div>
          <article className="privacy-card"><div className="section-title"><MiniIcon>⌾</MiniIcon><h2>{t("patient.share.privacy")}</h2></div><p>{t("patient.share.sensitiveExcluded")}</p><div className="privacy-row"><span>{t("patient.share.expiry")}</span><strong>{t("patient.share.minutes")}</strong></div><div className="privacy-row"><span>{t("patient.share.noActiveLinks")}</span><button onClick={() => flash("notice.linksRevoked")}>{t("patient.share.revoke")}</button></div></article>
        </div>}

        {section === "access" && <div className="page narrow">
          <div className="page-intro"><span className="intro-icon">◷</span><div><h1>{t("patient.access.title")}</h1><p>{t("patient.access.description")}</p></div></div>
          <article className="timeline">{data.accessHistory.map((event) => <div key={event.id}><span className="timeline-icon">{event.initials}</span><div><b>{event.actor}</b><p>{t(`patient.access.context.${event.contextKey}` as TranslationKey)}</p><small>{formatDateTime(language, event.occurredAt)}</small></div><span className="access-type">{t(`common.${event.actionKey}` as TranslationKey)}</span></div>)}{!data.accessHistory.length && <div><span className="timeline-icon">—</span><div><b>{t("patient.access.emptyTitle")}</b><p>{t("patient.access.emptyDescription")}</p></div></div>}</article>
        </div>}
      </section>

      <nav className="mobile-nav" aria-label={t("a11y.patientMobileNavigation")}>{nav.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><span>{item.icon}</span>{t(item.key)}</button>)}</nav>
      {doctorModal && <div className="modal-backdrop" onMouseDown={() => setDoctorModal(false)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="doctor-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={() => setDoctorModal(false)} aria-label={t("a11y.closeDialog")}>×</button><span className="modal-symbol">⚕</span><h2 id="doctor-title">{t("patient.modal.title")}</h2><p>{t("patient.modal.description")}</p><button className="verify-btn" onClick={() => { window.location.href = "/doctor"; }}>{t("patient.modal.continue")}</button><small>{t("patient.modal.note")}</small>
      </div></div>}
      {notice && <div className="toast" role="status">✓ {notice}</div>}
    </main>
  );
}
