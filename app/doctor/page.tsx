"use client";

import { useMemo, useState } from "react";

type View = "overview" | "patients" | "requests" | "activity";
type Patient = {
  id: string;
  initials: string;
  name: string;
  age: number;
  gender: string;
  lastReview: string;
  status: "Up to date" | "Review due" | "New update";
  conditions: string[];
  allergies: string[];
  medications: string[];
  access: string;
};

const patients: Patient[] = [
  {
    id: "VP-2048-1193",
    initials: "EV",
    name: "Elena Varga",
    age: 39,
    gender: "Female",
    lastReview: "24 Jul 2026",
    status: "New update",
    conditions: ["Type 2 diabetes", "Hypertension"],
    allergies: ["Penicillin", "Latex"],
    medications: ["Metformin 500 mg", "Lisinopril 10 mg"],
    access: "Family care team",
  },
  {
    id: "VP-7812-4406",
    initials: "AM",
    name: "Andrei Munteanu",
    age: 67,
    gender: "Male",
    lastReview: "22 Jul 2026",
    status: "Review due",
    conditions: ["Atrial fibrillation"],
    allergies: ["No known allergies"],
    medications: ["Apixaban 5 mg", "Bisoprolol 2.5 mg"],
    access: "Temporary access · 11 days left",
  },
  {
    id: "VP-3901-7724",
    initials: "SC",
    name: "Sofia Cristea",
    age: 28,
    gender: "Female",
    lastReview: "18 Jul 2026",
    status: "Up to date",
    conditions: ["Asthma"],
    allergies: ["Ibuprofen"],
    medications: ["Budesonide inhaler"],
    access: "Family care team",
  },
  {
    id: "VP-6620-0915",
    initials: "NP",
    name: "Nicolae Pavel",
    age: 54,
    gender: "Male",
    lastReview: "09 Jul 2026",
    status: "Up to date",
    conditions: ["Hyperlipidemia"],
    allergies: ["No known allergies"],
    medications: ["Atorvastatin 20 mg"],
    access: "Family care team",
  },
  {
    id: "VP-1139-8250",
    initials: "DI",
    name: "Daria Ionescu",
    age: 42,
    gender: "Female",
    lastReview: "02 Jul 2026",
    status: "Review due",
    conditions: ["Hypothyroidism"],
    allergies: ["No known allergies"],
    medications: ["Levothyroxine 75 mcg"],
    access: "Temporary access · 4 days left",
  },
];

const requests = [
  { id: 1, initials: "MR", name: "Mihai Radu", reason: "Medication reconciliation", received: "8 min ago", urgency: "Urgent" },
  { id: 2, initials: "LB", name: "Luca Barbu", reason: "New patient consultation", received: "36 min ago", urgency: "Routine" },
  { id: 3, initials: "IM", name: "Ioana Marin", reason: "Follow-up care", received: "1 hr ago", urgency: "Routine" },
];

const navItems: { id: View; label: string; mark: string; count?: number }[] = [
  { id: "overview", label: "Overview", mark: "01" },
  { id: "patients", label: "Patients", mark: "02" },
  { id: "requests", label: "Access requests", mark: "03", count: 3 },
  { id: "activity", label: "Activity log", mark: "04" },
];

export default function DoctorPortal() {
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [requestState, setRequestState] = useState<Record<number, "approved" | "declined">>({});
  const [notice, setNotice] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return patients;
    return patients.filter((patient) =>
      `${patient.name} ${patient.id} ${patient.conditions.join(" ")}`.toLowerCase().includes(term),
    );
  }, [query]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const decideRequest = (id: number, decision: "approved" | "declined", name: string) => {
    setRequestState((current) => ({ ...current, [id]: decision }));
    flash(`${name}'s request was ${decision}`);
  };

  return (
    <main className="dp-shell">
      <aside className="dp-sidebar">
        <a className="dp-brand" href="/" aria-label="VitaPass patient portal">
          <span className="dp-brand-mark">+</span>
          <span>VitaPass<small>Clinical</small></span>
        </a>
        <div className="dp-workspace">
          <span>Workspace</span>
          <strong>Bucharest Family Clinic</strong>
          <small>Primary care · RO</small>
        </div>
        <nav aria-label="Doctor portal navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => setView(item.id)}
            >
              <i>{item.mark}</i><span>{item.label}</span>
              {item.count && <b>{item.count}</b>}
            </button>
          ))}
        </nav>
        <div className="dp-security">
          <span className="dp-live-dot" />
          <div><strong>Secure session</strong><small>Auto-locks in 26 min</small></div>
        </div>
        <div className="dp-clinician">
          <span>AP</span>
          <div><strong>Dr. Ana Popescu</strong><small>Family medicine</small></div>
          <button aria-label="Account menu">···</button>
        </div>
      </aside>

      <section className="dp-main">
        <header className="dp-topbar">
          <button className="dp-menu" aria-label="Open navigation">+</button>
          <label className="dp-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setView("patients")}
              placeholder="Search patient name, VitaPass ID, or condition"
              aria-label="Search patients"
            />
            <kbd>⌘ K</kbd>
          </label>
          <button className="dp-icon-button" aria-label="Notifications">
            <span className="dp-notification-dot" />N
          </button>
          <a className="dp-exit" href="/">Patient portal</a>
        </header>

        <div className="dp-content">
          {view === "overview" && (
            <>
              <div className="dp-welcome">
                <div>
                  <p>WEDNESDAY · 29 JULY</p>
                  <h1>Good morning, Dr. Popescu.</h1>
                  <span>Here is what needs your attention today.</span>
                </div>
                <button onClick={() => setView("patients")}>Find a patient</button>
              </div>

              <div className="dp-metrics">
                <article><span className="dp-metric-icon mint">P</span><div><strong>128</strong><small>Patients in your care</small></div><em>+4 this month</em></article>
                <article><span className="dp-metric-icon amber">A</span><div><strong>3</strong><small>Access requests</small></div><em className="warn">1 urgent</em></article>
                <article><span className="dp-metric-icon blue">R</span><div><strong>24</strong><small>Records reviewed</small></div><em>Last 30 days</em></article>
              </div>

              <div className="dp-overview-grid">
                <section className="dp-panel">
                  <div className="dp-panel-head">
                    <div><h2>Needs review</h2><p>Updates and records awaiting your attention</p></div>
                    <button onClick={() => setView("patients")}>View all</button>
                  </div>
                  <div className="dp-review-list">
                    {patients.filter((patient) => patient.status !== "Up to date").map((patient) => (
                      <button key={patient.id} onClick={() => setSelected(patient)}>
                        <span className="dp-patient-avatar">{patient.initials}</span>
                        <span><strong>{patient.name}</strong><small>{patient.age} years · {patient.id}</small></span>
                        <span className={`dp-status ${patient.status === "Review due" ? "due" : "new"}`}>{patient.status}</span>
                        <i>→</i>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="dp-panel">
                  <div className="dp-panel-head">
                    <div><h2>Access requests</h2><p>Patient-approved profile access</p></div>
                    <button onClick={() => setView("requests")}>View all</button>
                  </div>
                  <div className="dp-request-preview">
                    {requests.slice(0, 2).map((request) => (
                      <div key={request.id}>
                        <span className="dp-patient-avatar alt">{request.initials}</span>
                        <span><strong>{request.name}</strong><small>{request.reason} · {request.received}</small></span>
                        <b className={request.urgency === "Urgent" ? "urgent" : ""}>{request.urgency}</b>
                      </div>
                    ))}
                  </div>
                  <button className="dp-review-requests" onClick={() => setView("requests")}>Review 3 requests</button>
                </section>
              </div>

              <section className="dp-panel dp-recent">
                <div className="dp-panel-head">
                  <div><h2>Recent patients</h2><p>Your most recently accessed profiles</p></div>
                  <button onClick={() => setView("patients")}>Patient directory</button>
                </div>
                <PatientTable items={patients.slice(0, 4)} onOpen={setSelected} />
              </section>
            </>
          )}

          {view === "patients" && (
            <section className="dp-directory">
              <div className="dp-page-title">
                <div><p>PATIENT DIRECTORY</p><h1>{query ? `Results for “${query}”` : "Patients in your care"}</h1><span>Review profiles shared with your clinical workspace.</span></div>
                <button onClick={() => flash("Invite link copied to clipboard")}>Invite patient</button>
              </div>
              <div className="dp-panel">
                <div className="dp-directory-tools">
                  <span>{filtered.length} patient{filtered.length === 1 ? "" : "s"}</span>
                  <div><button className="active">All</button><button>Needs review</button><button>Temporary</button></div>
                </div>
                {filtered.length ? <PatientTable items={filtered} onOpen={setSelected} /> : (
                  <div className="dp-empty"><strong>No matching patients</strong><span>Try a name, VitaPass ID, or medical condition.</span></div>
                )}
              </div>
            </section>
          )}

          {view === "requests" && (
            <section className="dp-directory">
              <div className="dp-page-title"><div><p>SECURE ACCESS</p><h1>Access requests</h1><span>Review patient-approved requests before opening a medical profile.</span></div></div>
              <div className="dp-request-list">
                {requests.map((request) => {
                  const decision = requestState[request.id];
                  return (
                    <article className="dp-panel" key={request.id}>
                      <span className="dp-patient-avatar alt">{request.initials}</span>
                      <div><strong>{request.name}</strong><p>{request.reason}</p><small>Received {request.received} · Identity verified</small></div>
                      {decision ? <span className={`dp-decision ${decision}`}>{decision}</span> : (
                        <div className="dp-request-actions">
                          <button onClick={() => decideRequest(request.id, "declined", request.name)}>Decline</button>
                          <button onClick={() => decideRequest(request.id, "approved", request.name)}>Approve access</button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {view === "activity" && (
            <section className="dp-directory">
              <div className="dp-page-title"><div><p>AUDIT TRAIL</p><h1>Clinical activity</h1><span>Every profile access and signed action is recorded.</span></div><button onClick={() => flash("Audit export is being prepared")}>Export log</button></div>
              <div className="dp-panel dp-activity-list">
                {[
                  ["Today, 10:42", "Elena Varga", "Reviewed patient-submitted profile update", "Clinical review"],
                  ["Today, 09:18", "Mihai Radu", "Access request received", "Access"],
                  ["Yesterday, 16:05", "Andrei Munteanu", "Opened medical profile for consultation", "Profile view"],
                  ["27 Jul, 11:31", "Sofia Cristea", "Signed medication update", "Signed update"],
                ].map(([time, name, action, type]) => (
                  <div key={`${time}-${name}`}><span className="dp-activity-mark" /><time>{time}</time><div><strong>{name}</strong><p>{action}</p></div><b>{type}</b></div>
                ))}
              </div>
            </section>
          )}
        </div>
      </section>

      {selected && (
        <div className="dp-drawer-backdrop" onMouseDown={() => setSelected(null)}>
          <aside className="dp-drawer" role="dialog" aria-modal="true" aria-labelledby="patient-name" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dp-drawer-head">
              <span className="dp-patient-avatar large">{selected.initials}</span>
              <div><small>{selected.id}</small><h2 id="patient-name">{selected.name}</h2><p>{selected.age} years · {selected.gender}</p></div>
              <button onClick={() => setSelected(null)} aria-label="Close patient profile">×</button>
            </div>
            <div className="dp-access-note"><span className="dp-live-dot" /><div><strong>Authorized access</strong><small>{selected.access}</small></div></div>
            {selected.allergies[0] !== "No known allergies" && (
              <div className="dp-allergy-alert"><strong>Allergy alert</strong><span>{selected.allergies.join(" · ")}</span></div>
            )}
            <section className="dp-record-section"><h3>Conditions</h3><div className="dp-record-tags">{selected.conditions.map((item) => <span key={item}>{item}</span>)}</div></section>
            <section className="dp-record-section"><h3>Current medications</h3>{selected.medications.map((item) => <div className="dp-med-row" key={item}><span>Rx</span><strong>{item}</strong></div>)}</section>
            <section className="dp-record-section"><h3>Last clinical review</h3><p>{selected.lastReview} · Dr. Ana Popescu</p></section>
            <div className="dp-drawer-actions">
              <button onClick={() => flash("Clinical note draft opened")}>Add clinical note</button>
              <button onClick={() => { flash(`${selected.name}'s profile marked as reviewed`); setSelected(null); }}>Mark as reviewed</button>
            </div>
            <small className="dp-audit-note">Viewing this profile is recorded in the VitaPass audit trail.</small>
          </aside>
        </div>
      )}
      {notice && <div className="dp-toast" role="status">✓ {notice}</div>}
    </main>
  );
}

function PatientTable({ items, onOpen }: { items: Patient[]; onOpen: (patient: Patient) => void }) {
  return (
    <div className="dp-table-wrap">
      <table className="dp-table">
        <thead><tr><th>Patient</th><th>Conditions</th><th>Last reviewed</th><th>Status</th><th><span className="sr-only">Open</span></th></tr></thead>
        <tbody>{items.map((patient) => (
          <tr key={patient.id} onClick={() => onOpen(patient)}>
            <td><span className="dp-patient-avatar">{patient.initials}</span><span><strong>{patient.name}</strong><small>{patient.id}</small></span></td>
            <td>{patient.conditions.join(", ")}</td>
            <td>{patient.lastReview}</td>
            <td><span className={`dp-status ${patient.status === "Review due" ? "due" : patient.status === "New update" ? "new" : "current"}`}>{patient.status}</span></td>
            <td><button onClick={(event) => { event.stopPropagation(); onOpen(patient); }} aria-label={`Open ${patient.name}'s profile`}>→</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
