"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type {
  DoctorAccessRequest,
  DoctorPatientSummary,
  DoctorPortalData,
} from "../demo-data";

type View = "overview" | "patients" | "requests" | "activity";
type Patient = DoctorPatientSummary;

const navItems: { id: View; label: string; mark: string }[] = [
  { id: "overview", label: "Overview", mark: "01" },
  { id: "patients", label: "Patients", mark: "02" },
  { id: "requests", label: "Access requests", mark: "03" },
  { id: "activity", label: "Activity log", mark: "04" },
];

export default function DoctorPortal({ initialData }: { initialData: DoctorPortalData }) {
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [requests, setRequests] = useState<DoctorAccessRequest[]>(initialData.requests);
  const [requestState, setRequestState] = useState<Record<string, "approved" | "declined">>({});
  const [notice, setNotice] = useState("");
  const patients = initialData.patients;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return patients;
    return patients.filter((patient) =>
      `${patient.name} ${patient.id} ${patient.conditions.join(" ")}`.toLowerCase().includes(term),
    );
  }, [patients, query]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const decideRequest = (id: string, decision: "approved" | "declined", name: string) => {
    setRequestState((current) => ({ ...current, [id]: decision }));
    window.setTimeout(
      () => setRequests((current) => current.filter((request) => request.id !== id)),
      700,
    );
    flash(`${name}'s request was ${decision}`);
  };

  return (
    <main className="dp-shell">
      <aside className="dp-sidebar">
        <Link className="dp-brand" href="/" aria-label="VitaPass patient portal">
          <span className="dp-brand-mark">+</span>
          <span>VitaPass<small>Clinical</small></span>
        </Link>
        <div className="dp-workspace">
          <span>Workspace</span>
          <strong>{initialData.clinician.clinicName}</strong>
          <small>Primary care · {initialData.clinician.clinicCountry}</small>
        </div>
        <nav aria-label="Doctor portal navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => setView(item.id)}
            >
              <i>{item.mark}</i><span>{item.label}</span>
              {item.id === "requests" && requests.length > 0 && <b>{requests.length}</b>}
            </button>
          ))}
        </nav>
        <div className="dp-security">
          <span className="dp-live-dot" />
          <div><strong>Secure session</strong><small>Auto-locks in 26 min</small></div>
        </div>
        <div className="dp-clinician">
          <span>{initialData.clinician.initials}</span>
          <div><strong>{initialData.clinician.name}</strong><small>{initialData.clinician.specialty}</small></div>
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
          <Link className="dp-exit" href="/">Patient portal</Link>
        </header>

        <div className="dp-content">
          {view === "overview" && (
            <>
              <div className="dp-welcome">
                <div>
                  <p>WEDNESDAY · 29 JULY</p>
                  <h1>Good morning, {initialData.clinician.name}.</h1>
                  <span>Here is what needs your attention today.</span>
                </div>
                <button onClick={() => setView("patients")}>Find a patient</button>
              </div>

              <div className="dp-metrics">
                <article><span className="dp-metric-icon mint">P</span><div><strong>{initialData.metrics.patientCount}</strong><small>Patients in your care</small></div><em>Active grants</em></article>
                <article><span className="dp-metric-icon amber">A</span><div><strong>{requests.length}</strong><small>Access requests</small></div><em className="warn">{initialData.metrics.urgentRequestCount} urgent</em></article>
                <article><span className="dp-metric-icon blue">R</span><div><strong>{initialData.metrics.reviewedLastThirtyDays}</strong><small>Records reviewed</small></div><em>Last 30 days</em></article>
              </div>

              <div className="dp-overview-grid">
                <section className="dp-panel">
                  <div className="dp-panel-head">
                    <div><h2>Needs review</h2><p>Updates and records awaiting your attention</p></div>
                    <button onClick={() => setView("patients")}>View all</button>
                  </div>
                  <div className="dp-review-list">
                    {patients.filter((patient) => patient.status !== "Up to date").slice(0, 4).map((patient) => (
                      <button key={patient.id} onClick={() => setSelected(patient)}>
                        <span className="dp-patient-avatar">{patient.initials}</span>
                        <span><strong>{patient.name}</strong><small>{patient.age} years · {patient.id}</small></span>
                        <span className={`dp-status ${patient.status === "Review due" ? "due" : "new"}`}>{patient.status}</span>
                        <i>→</i>
                      </button>
                    ))}
                    {!patients.some((patient) => patient.status !== "Up to date") && <div className="dp-empty"><strong>Nothing needs review</strong><span>New patient updates will appear here.</span></div>}
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
                  <button className="dp-review-requests" onClick={() => setView("requests")}>Review {requests.length} requests</button>
                </section>
              </div>

              <section className="dp-panel dp-recent">
                <div className="dp-panel-head">
                  <div><h2>Recent patients</h2><p>Your most recently accessed profiles</p></div>
                  <button onClick={() => setView("patients")}>Patient directory</button>
                </div>
                {patients.length ? <PatientTable items={patients.slice(0, 4)} onOpen={setSelected} /> : <div className="dp-empty"><strong>No patient grants</strong><span>Approved access grants will appear here.</span></div>}
              </section>
            </>
          )}

          {view === "patients" && (
            <section className="dp-directory">
              <div className="dp-page-title">
                <div><p>PATIENT DIRECTORY</p><h1>{query ? `Results for “${query}”` : "Patients in your care"}</h1><span>Review profiles shared with your clinical workspace.</span></div>
                <button onClick={() => flash("Patient invitation link copied")}>Invite patient</button>
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
                {!requests.length && <div className="dp-panel dp-empty"><strong>No pending requests</strong><span>New patient access requests will appear here.</span></div>}
              </div>
            </section>
          )}

          {view === "activity" && (
            <section className="dp-directory">
              <div className="dp-page-title"><div><p>AUDIT TRAIL</p><h1>Clinical activity</h1><span>Every profile access and signed action is recorded.</span></div><button onClick={() => flash("Audit export prepared")}>Export log</button></div>
              <div className="dp-panel dp-activity-list">
                {initialData.activity.map(({ id, time, name, action, type }) => (
                  <div key={id}><span className="dp-activity-mark" /><time>{time}</time><div><strong>{name}</strong><p>{action}</p></div><b>{type}</b></div>
                ))}
                {!initialData.activity.length && <div className="dp-empty"><strong>No clinical activity</strong><span>Authorized actions will be recorded here.</span></div>}
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
              <button onClick={() => {
                flash(`${selected.name}'s profile marked as reviewed`);
                setSelected(null);
              }}>Mark as reviewed</button>
            </div>
            <small className="dp-audit-note">Prototype activity is stored only for the current browser session.</small>
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
