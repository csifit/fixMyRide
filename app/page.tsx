"use client";

import { useMemo, useState } from "react";

type Language = "en" | "de" | "ro" | "hu";
type Section = "profile" | "share" | "access";

const copy = {
  en: {
    profile: "Medical profile", share: "Share safely", access: "Access history",
    verified: "Identity verified", readonly: "Patient view · Read only",
    critical: "Critical information", personal: "Personal details",
    medications: "Current medications", conditions: "Conditions & history",
    devices: "Implants & devices", contacts: "Care contacts",
    dob: "Date of birth", blood: "Blood group", sex: "Sex", donor: "Organ donor",
    allergies: "Allergies", chronic: "Chronic conditions", surgeries: "Previous surgeries",
    emergency: "Emergency contact", doctor: "Family doctor", lastUpdated: "Last updated",
    emergencyMode: "Emergency mode", doctorAccess: "Doctor access",
    shareTitle: "Share your profile", shareText: "Choose a secure way to give a healthcare professional temporary access.",
    scan: "Scan to view", qrHelp: "Valid for 15 minutes · View only", nfc: "Share via NFC",
    nfcHelp: "Hold near another device", email: "Send secure email", emailHelp: "Create an expiring link",
    download: "Download emergency card", privacy: "Privacy controls", expiry: "Link expiry",
    revoke: "Revoke all active links", noLinks: "No active share links",
    auditTitle: "Who viewed your profile", auditText: "Every access is recorded for your safety.",
    signedIn: "Signed in as patient", signOut: "Sign out", minutes: "15 minutes",
    editAfter: "Only a verified healthcare professional can make changes.",
  },
  de: {
    profile: "Medizinisches Profil", share: "Sicher teilen", access: "Zugriffsverlauf",
    verified: "Identität bestätigt", readonly: "Patientenansicht · Schreibgeschützt",
    critical: "Kritische Informationen", personal: "Persönliche Daten",
    medications: "Aktuelle Medikamente", conditions: "Erkrankungen & Verlauf",
    devices: "Implantate & Geräte", contacts: "Medizinische Kontakte",
    dob: "Geburtsdatum", blood: "Blutgruppe", sex: "Geschlecht", donor: "Organspender",
    allergies: "Allergien", chronic: "Chronische Erkrankungen", surgeries: "Frühere Operationen",
    emergency: "Notfallkontakt", doctor: "Hausarzt", lastUpdated: "Zuletzt aktualisiert",
    emergencyMode: "Notfallmodus", doctorAccess: "Arztzugang",
    shareTitle: "Profil teilen", shareText: "Wählen Sie eine sichere Methode für einen zeitlich begrenzten Zugriff.",
    scan: "Zum Anzeigen scannen", qrHelp: "15 Minuten gültig · Nur Lesen", nfc: "Über NFC teilen",
    nfcHelp: "An ein anderes Gerät halten", email: "Sichere E-Mail senden", emailHelp: "Ablaufenden Link erstellen",
    download: "Notfallkarte herunterladen", privacy: "Datenschutz", expiry: "Link-Ablauf",
    revoke: "Alle aktiven Links widerrufen", noLinks: "Keine aktiven Freigabelinks",
    auditTitle: "Wer Ihr Profil angesehen hat", auditText: "Jeder Zugriff wird zu Ihrer Sicherheit protokolliert.",
    signedIn: "Als Patient angemeldet", signOut: "Abmelden", minutes: "15 Minuten",
    editAfter: "Nur verifizierte medizinische Fachkräfte können Änderungen vornehmen.",
  },
  ro: {
    profile: "Profil medical", share: "Partajare sigură", access: "Istoric acces",
    verified: "Identitate verificată", readonly: "Vizualizare pacient · Doar citire",
    critical: "Informații critice", personal: "Date personale",
    medications: "Medicație curentă", conditions: "Afecțiuni și istoric",
    devices: "Implanturi și dispozitive", contacts: "Contacte medicale",
    dob: "Data nașterii", blood: "Grupa sanguină", sex: "Sex", donor: "Donator de organe",
    allergies: "Alergii", chronic: "Afecțiuni cronice", surgeries: "Intervenții anterioare",
    emergency: "Contact de urgență", doctor: "Medic de familie", lastUpdated: "Ultima actualizare",
    emergencyMode: "Mod urgență", doctorAccess: "Acces medic",
    shareTitle: "Partajează profilul", shareText: "Alege o metodă sigură de acces temporar pentru un cadru medical.",
    scan: "Scanează pentru vizualizare", qrHelp: "Valabil 15 minute · Doar citire", nfc: "Partajează prin NFC",
    nfcHelp: "Apropie de alt dispozitiv", email: "Trimite email securizat", emailHelp: "Creează un link temporar",
    download: "Descarcă fișa de urgență", privacy: "Control confidențialitate", expiry: "Expirarea linkului",
    revoke: "Revocă toate linkurile active", noLinks: "Niciun link activ",
    auditTitle: "Cine a văzut profilul", auditText: "Fiecare acces este înregistrat pentru siguranța ta.",
    signedIn: "Conectat ca pacient", signOut: "Deconectare", minutes: "15 minute",
    editAfter: "Doar un cadru medical verificat poate face modificări.",
  },
  hu: {
    profile: "Orvosi profil", share: "Biztonságos megosztás", access: "Hozzáférési előzmények",
    verified: "Ellenőrzött személyazonosság", readonly: "Páciens nézet · Csak olvasható",
    critical: "Kritikus információk", personal: "Személyes adatok",
    medications: "Jelenlegi gyógyszerek", conditions: "Állapotok és előzmények",
    devices: "Implantátumok és eszközök", contacts: "Egészségügyi kapcsolatok",
    dob: "Születési dátum", blood: "Vércsoport", sex: "Nem", donor: "Szervdonor",
    allergies: "Allergiák", chronic: "Krónikus betegségek", surgeries: "Korábbi műtétek",
    emergency: "Vészhelyzeti kapcsolat", doctor: "Háziorvos", lastUpdated: "Utolsó frissítés",
    emergencyMode: "Vészhelyzeti mód", doctorAccess: "Orvosi hozzáférés",
    shareTitle: "Profil megosztása", shareText: "Válasszon biztonságos módot az ideiglenes egészségügyi hozzáféréshez.",
    scan: "Beolvasás megtekintéshez", qrHelp: "15 percig érvényes · Csak olvasható", nfc: "Megosztás NFC-vel",
    nfcHelp: "Tartsa egy másik eszközhöz", email: "Biztonságos e-mail", emailHelp: "Lejáró hivatkozás létrehozása",
    download: "Vészhelyzeti kártya letöltése", privacy: "Adatvédelmi beállítások", expiry: "Link lejárata",
    revoke: "Minden aktív link visszavonása", noLinks: "Nincs aktív megosztási link",
    auditTitle: "Ki tekintette meg a profilját", auditText: "Biztonsága érdekében minden hozzáférést naplózunk.",
    signedIn: "Bejelentkezve páciensként", signOut: "Kijelentkezés", minutes: "15 perc",
    editAfter: "Csak ellenőrzött egészségügyi szakember módosíthatja.",
  },
} as const;

const profile = {
  name: "Elena Varga",
  initials: "EV",
  dob: "14 February 1987",
  blood: "A+",
  sex: "Female",
  donor: "Yes",
  allergies: ["Penicillin", "Latex"],
  medications: [
    { name: "Metformin", dose: "500 mg", timing: "Twice daily" },
    { name: "Lisinopril", dose: "10 mg", timing: "Every morning" },
  ],
  chronic: ["Type 2 diabetes", "Hypertension"],
  surgeries: ["Appendectomy · 2009"],
  implants: ["No implants or medical devices"],
  emergency: "Márton Varga · Husband",
  emergencyPhone: "+40 721 555 014",
  doctor: "Dr. Ana Popescu",
  doctorPhone: "+40 21 555 0182",
};

function MiniIcon({ children, alert = false }: { children: React.ReactNode; alert?: boolean }) {
  return <span className={`mini-icon ${alert ? "alert" : ""}`}>{children}</span>;
}

function QrCode() {
  const cells = useMemo(() => Array.from({ length: 121 }, (_, i) => {
    const x = i % 11, y = Math.floor(i / 11);
    const finder = (x < 3 && y < 3) || (x > 7 && y < 3) || (x < 3 && y > 7);
    return finder || ((x * 3 + y * 5 + x * y) % 7 < 3);
  }), []);
  return <div className="qr" aria-label="Temporary medical profile QR code">{cells.map((on, i) => <i key={i} className={on ? "on" : ""} />)}</div>;
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("en");
  const [section, setSection] = useState<Section>("profile");
  const [emergency, setEmergency] = useState(false);
  const [doctorModal, setDoctorModal] = useState(false);
  const [doctorMode, setDoctorMode] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const t = copy[language];

  const notify = (message: string) => {
    setShareNotice(message);
    window.setTimeout(() => setShareNotice(""), 2600);
  };

  return (
    <main className={emergency ? "app emergency-theme" : "app"}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">+</span><span>VitaPass</span></div>
        <nav aria-label="Main navigation">
          <button className={section === "profile" ? "active" : ""} onClick={() => setSection("profile")}><MiniIcon>♥</MiniIcon>{t.profile}</button>
          <button className={section === "share" ? "active" : ""} onClick={() => setSection("share")}><MiniIcon>↗</MiniIcon>{t.share}</button>
          <button className={section === "access" ? "active" : ""} onClick={() => setSection("access")}><MiniIcon>◷</MiniIcon>{t.access}</button>
        </nav>
        <div className="sidebar-foot">
          <button className="doctor-link" onClick={() => setDoctorModal(true)}><span className="status-dot" />{t.doctorAccess}<span>→</span></button>
          <div className="signed-in"><div className="avatar small">EV</div><div><b>Elena Varga</b><span>{t.signedIn}</span></div><button aria-label={t.signOut}>↗</button></div>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => setSection("profile")}><span className="brand-mark">+</span>VitaPass</button>
          <div className="top-actions">
            <label className="language"><span>◎</span><select value={language} onChange={(e) => setLanguage(e.target.value as Language)} aria-label="Language">
              <option value="en">English</option><option value="de">Deutsch</option><option value="ro">Română</option><option value="hu">Magyar</option>
            </select></label>
            <button className="emergency-btn" onClick={() => setEmergency(!emergency)}><span>✣</span>{t.emergencyMode}</button>
            <button className="doctor-mobile" onClick={() => setDoctorModal(true)}>⚕</button>
          </div>
        </header>

        {section === "profile" && (
          <div className="page">
            <div className="profile-head">
              <div className="avatar">EV</div>
              <div><h1>{profile.name}</h1><p>{t.dob} · {profile.dob}</p><div className="badges"><span className="verified">✓ {t.verified}</span><span className="readonly">⌕ {doctorMode ? "Clinician edit mode" : t.readonly}</span></div></div>
              {doctorMode && <button className="save-btn" onClick={() => { setDoctorMode(false); notify("Medical record saved and signed"); }}>Save signed update</button>}
            </div>

            <section className="critical-card">
              <div className="section-title"><MiniIcon alert>!</MiniIcon><div><h2>{t.critical}</h2><p>Essential details for emergency care</p></div></div>
              <div className="critical-grid">
                <div><span>{t.blood}</span><strong className="blood">{profile.blood}</strong></div>
                <div><span>{t.allergies}</span><div className="tags">{profile.allergies.map(a => <strong key={a}>{a}</strong>)}</div></div>
                <div><span>{t.emergency}</span><strong>{profile.emergency}</strong><a href={`tel:${profile.emergencyPhone}`}>{profile.emergencyPhone}</a></div>
              </div>
            </section>

            <div className="info-grid">
              <article className="card">
                <div className="section-title"><MiniIcon>○</MiniIcon><h2>{t.personal}</h2>{doctorMode && <span className="edit-chip">Editable</span>}</div>
                <dl>
                  <div><dt>{t.dob}</dt><dd>{profile.dob}</dd></div>
                  <div><dt>{t.sex}</dt><dd>{profile.sex}</dd></div>
                  <div><dt>{t.blood}</dt><dd>{profile.blood}</dd></div>
                  <div><dt>{t.donor}</dt><dd><span className="yes">Yes</span></dd></div>
                </dl>
              </article>
              <article className="card">
                <div className="section-title"><MiniIcon>✚</MiniIcon><h2>{t.medications}</h2>{doctorMode && <button className="add-btn">+ Add</button>}</div>
                <div className="med-list">{profile.medications.map(m => <div className="med" key={m.name}><span className="pill">◆</span><div><strong>{m.name}</strong><p>{m.dose} · {m.timing}</p></div></div>)}</div>
              </article>
              <article className="card">
                <div className="section-title"><MiniIcon>⌁</MiniIcon><h2>{t.conditions}</h2></div>
                <div className="detail-block"><span>{t.chronic}</span><div className="tags calm">{profile.chronic.map(c => <strong key={c}>{c}</strong>)}</div></div>
                <div className="detail-block"><span>{t.surgeries}</span><strong>{profile.surgeries[0]}</strong></div>
              </article>
              <article className="card">
                <div className="section-title"><MiniIcon>◇</MiniIcon><h2>{t.devices}</h2></div>
                <p className="empty-state"><span>✓</span>{profile.implants[0]}</p>
              </article>
              <article className="card wide">
                <div className="section-title"><MiniIcon>♧</MiniIcon><h2>{t.contacts}</h2></div>
                <div className="contact-grid">
                  <div><span className="contact-avatar">MV</span><div><small>{t.emergency}</small><strong>{profile.emergency}</strong><a href={`tel:${profile.emergencyPhone}`}>{profile.emergencyPhone}</a></div></div>
                  <div><span className="contact-avatar doctor">AP</span><div><small>{t.doctor}</small><strong>{profile.doctor}</strong><a href={`tel:${profile.doctorPhone}`}>{profile.doctorPhone}</a></div></div>
                </div>
              </article>
            </div>
            <p className="update-note">✓ {t.lastUpdated}: 24 July 2026 · {profile.doctor}</p>
          </div>
        )}

        {section === "share" && (
          <div className="page narrow">
            <div className="page-intro"><span className="intro-icon">↗</span><div><h1>{t.shareTitle}</h1><p>{t.shareText}</p></div></div>
            <div className="share-layout">
              <article className="qr-card"><div className="qr-wrap"><QrCode /></div><h2>{t.scan}</h2><p>{t.qrHelp}</p><span className="countdown">14:52</span></article>
              <div className="share-options">
                <button onClick={() => notify("NFC sharing is ready — hold devices close")}><MiniIcon>)))</MiniIcon><span><b>{t.nfc}</b><small>{t.nfcHelp}</small></span><i>→</i></button>
                <button onClick={() => notify("A protected email link is ready to send")}><MiniIcon>@</MiniIcon><span><b>{t.email}</b><small>{t.emailHelp}</small></span><i>→</i></button>
                <button onClick={() => notify("Emergency card prepared for download")}><MiniIcon>↓</MiniIcon><span><b>{t.download}</b><small>Offline access · PDF</small></span><i>→</i></button>
              </div>
            </div>
            <article className="privacy-card"><div className="section-title"><MiniIcon>⌾</MiniIcon><h2>{t.privacy}</h2></div><div className="privacy-row"><span>{t.expiry}</span><strong>{t.minutes}</strong></div><div className="privacy-row"><span>{t.noLinks}</span><button onClick={() => notify("All share links have been revoked")}>{t.revoke}</button></div></article>
          </div>
        )}

        {section === "access" && (
          <div className="page narrow">
            <div className="page-intro"><span className="intro-icon">◷</span><div><h1>{t.auditTitle}</h1><p>{t.auditText}</p></div></div>
            <article className="timeline">
              <div><span className="timeline-icon">⚕</span><div><b>Dr. Ana Popescu</b><p>Bucharest Family Clinic · QR access</p><small>24 July 2026 · 10:42 · Profile updated</small></div><span className="access-type edit">Edited</span></div>
              <div><span className="timeline-icon">✚</span><div><b>St. Maria Emergency Department</b><p>Verified clinician · NFC access</p><small>11 June 2026 · 21:17 · 8 minute session</small></div><span className="access-type">Viewed</span></div>
              <div><span className="timeline-icon">EV</span><div><b>You</b><p>Personal device · Secure sign-in</p><small>9 June 2026 · 08:03</small></div><span className="access-type">Viewed</span></div>
            </article>
          </div>
        )}
      </section>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button className={section === "profile" ? "active" : ""} onClick={() => setSection("profile")}><span>♥</span>{t.profile}</button>
        <button className={section === "share" ? "active" : ""} onClick={() => setSection("share")}><span>↗</span>{t.share}</button>
        <button className={section === "access" ? "active" : ""} onClick={() => setSection("access")}><span>◷</span>{t.access}</button>
      </nav>

      {doctorModal && <div className="modal-backdrop" onMouseDown={() => setDoctorModal(false)}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="doctor-title" onMouseDown={e => e.stopPropagation()}>
          <button className="modal-close" onClick={() => setDoctorModal(false)} aria-label="Close">×</button>
          <span className="modal-symbol">⚕</span><h2 id="doctor-title">Verified clinician access</h2>
          <p>Open a shared profile, then verify your professional identity before making a signed update.</p>
          <label>Professional ID<input defaultValue="RO-MED-48291" /></label>
          <label>One-time verification code<input defaultValue="MED-2048" /></label>
          <button className="verify-btn" onClick={() => { setDoctorMode(true); setDoctorModal(false); setSection("profile"); notify("Clinician identity verified"); }}>Verify & open edit mode</button>
          <small>Demo flow · In production, connect to national medical identity systems.</small>
        </div>
      </div>}
      {shareNotice && <div className="toast" role="status">✓ {shareNotice}</div>}
    </main>
  );
}
