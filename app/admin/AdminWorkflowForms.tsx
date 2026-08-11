"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import GoogleAddressSearch from "@/app/GoogleAddressSearch";
import type { Language, TranslationKey } from "@/app/i18n";
import type { AdminOrganisationWorkflow } from "@/lib/dal/admin-organisations";
import {
  assignLocationManagerAction,
  createWorkshopLocationAction,
  inviteLocationManagerAction,
  inviteServiceOrganisationAction,
  updateWorkshopLocationAction,
  updatePlatformAccountStatusAction,
  type AdminWorkflowActionState,
} from "./workflow-actions";

type T = (key: TranslationKey) => string;
const initial: AdminWorkflowActionState = { status: "idle" };

function locationPinLabels(t: T) {
  return {
    searchMode: t("adminWorkflow.locationMode.search"),
    pinMode: t("adminWorkflow.locationMode.pin"),
    mapLabel: t("adminWorkflow.locationMode.mapLabel"),
    mapHelp: t("adminWorkflow.locationMode.mapHelp"),
    latitude: t("adminWorkflow.latitude"),
    longitude: t("adminWorkflow.longitude"),
    address: t("adminWorkflow.manualAddress"),
    city: t("adminWorkflow.nearestCity"),
    country: t("adminWorkflow.country"),
  };
}

function Result({ state, t }: { state: AdminWorkflowActionState; t: T }) {
  if (state.status === "idle") return null;
  return <div className={state.status === "saved" ? "note-success" : "note-error"} role="status">
    <span>{t(`adminWorkflow.result.${state.status}` as TranslationKey)}</span>
    {state.invitationUrl && <><input value={state.invitationUrl} readOnly aria-label={t("adminWorkflow.invitationLink")} /><small>{t("adminWorkflow.copyLinkHelp")}</small></>}
  </div>;
}

export function OrganisationAdministration({ providers, invitations, t }: {
  providers: Array<{ id: string; displayName: string; status: string }>;
  invitations: AdminOrganisationWorkflow["invitations"]; t: T;
}) {
  const [state, action, pending] = useActionState(inviteServiceOrganisationAction, initial);
  const pendingInvitations = invitations.filter((item) => item.status === "pending");
  return <div className="admin-workflow-stack">
    <details className="admin-workflow-card" open><summary><span><strong>{t("adminWorkflow.inviteOrganisation")}</strong><small>{t("adminWorkflow.inviteOrganisationHelp")}</small></span></summary>
      <form className="admin-workflow-form" action={action}>
        <label>{t("adminWorkflow.legalName")}<input name="legalName" required minLength={2} maxLength={200} /></label>
        <label>{t("adminWorkflow.displayName")}<input name="displayName" required minLength={2} maxLength={160} /></label>
        <label>{t("adminWorkflow.country")}<input name="countryCode" defaultValue="RO" required pattern="[A-Za-z]{2}" maxLength={2} /></label>
        <label>{t("adminWorkflow.ownerEmail")}<input name="email" type="email" required /></label>
        <button disabled={pending}>{t("adminWorkflow.createInvitation")}</button><Result state={state} t={t} />
      </form>
    </details>
    <section className="admin-workflow-card"><h3>{t("adminWorkflow.pendingInvitations")}</h3>
      <div className="admin-invitation-list">{pendingInvitations.map((item) => <p key={item.id}><span><strong>{item.email}</strong><small>{item.providerName}{item.workshopName ? ` · ${item.workshopName}` : ""}</small></span><b>{item.kind}</b></p>)}{!pendingInvitations.length && <p>{t("adminWorkflow.noPendingInvitations")}</p>}</div>
    </section>
    <section className="admin-workflow-card"><h3>{t("adminWorkflow.organisationSummary")}</h3><p>{providers.length} {t("automotiveAdmin.providers")}</p></section>
  </div>;
}

function LocationForm({ providers, language, t }: {
  providers: Array<{ id: string; displayName: string; status: string }>; language: Language; t: T;
}) {
  const [state, action, pending] = useActionState(createWorkshopLocationAction, initial);
  const [locationReady, setLocationReady] = useState(false);
  return <details className="admin-workflow-card" open><summary><span><strong>{t("adminWorkflow.addLocation")}</strong><small>{t("adminWorkflow.addLocationHelp")}</small></span></summary>
    <form className="admin-workflow-form" action={action}>
      <label>{t("adminWorkflow.providerOptional")}<select name="providerId" defaultValue=""><option value="">{t("adminWorkflow.noProvider")}</option>{providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.displayName} · {provider.status}</option>)}</select></label>
      <label>{t("adminWorkflow.locationName")}<input name="displayName" required minLength={2} maxLength={160} /></label>
      <GoogleAddressSearch label={t("adminWorkflow.address")} placeholder={t("home.addressSearchPlaceholder")} help={t("workspace.addressSearchHelp")} unavailable={t("adminWorkflow.addressSearchUnavailable")} language={language} disabled={pending} allowManualPin manualPinLabels={locationPinLabels(t)} onSelection={(selection) => setLocationReady(Boolean(selection?.city && selection.latitude !== null && selection.longitude !== null))} />
      <label>{t("adminWorkflow.publicPhone")}<input name="publicPhone" maxLength={40} /></label>
      <label>{t("adminWorkflow.publicEmail")}<input name="publicEmail" type="email" maxLength={320} /></label>
      <button disabled={pending || !locationReady}>{t("adminWorkflow.createLocation")}</button><Result state={state} t={t} />
    </form>
  </details>;
}

function LocationEditForm({ workshop, language, t }: {
  workshop: AdminOrganisationWorkflow["workshops"][number]; language: Language; t: T;
}) {
  const [state, action, pending] = useActionState(updateWorkshopLocationAction, initial);
  const [locationReady, setLocationReady] = useState(Boolean(
    workshop.address && workshop.city
    && workshop.latitude !== null && workshop.longitude !== null,
  ));
  return <form className="admin-workflow-form" action={action}>
      <input type="hidden" name="workshopId" value={workshop.id} />
      <label>{t("adminWorkflow.locationName")}<input name="displayName" required minLength={2} maxLength={160} defaultValue={workshop.displayName} /></label>
      <GoogleAddressSearch label={t("adminWorkflow.address")} placeholder={t("home.addressSearchPlaceholder")} help={t("workspace.addressSearchHelp")} unavailable={t("adminWorkflow.addressSearchUnavailable")} language={language} disabled={pending} initialAddress={workshop.address ?? ""} initialCity={workshop.city ?? ""} initialCountryCode={workshop.countryCode} initialLatitude={workshop.latitude} initialLongitude={workshop.longitude} allowManualPin manualPinLabels={locationPinLabels(t)} onSelection={(selection) => setLocationReady(Boolean(selection?.city && selection.latitude !== null && selection.longitude !== null))} />
      <label>{t("adminWorkflow.publicPhone")}<input name="publicPhone" maxLength={40} defaultValue={workshop.publicPhone ?? ""} /></label>
      <label>{t("adminWorkflow.publicEmail")}<input name="publicEmail" type="email" maxLength={320} defaultValue={workshop.publicEmail ?? ""} /></label>
      <button disabled={pending || !locationReady}>{t("adminWorkflow.saveLocation")}</button>
      <Result state={state} t={t} />
    </form>;
}

function ManagerInviteForm({ workshops, t }: { workshops: AdminOrganisationWorkflow["workshops"]; t: T }) {
  const [state, action, pending] = useActionState(inviteLocationManagerAction, initial);
  return <details className="admin-workflow-card"><summary><span><strong>{t("adminWorkflow.inviteManager")}</strong><small>{t("adminWorkflow.inviteManagerHelp")}</small></span></summary>
    <form className="admin-workflow-form" action={action}>
      <label>{t("automotiveAdmin.workshop")}<select name="workshopId" required>{workshops.map((workshop) => <option value={workshop.id} key={workshop.id}>{workshop.displayName}</option>)}</select></label>
      <label>{t("adminWorkflow.managerEmail")}<input name="email" type="email" required /></label>
      <label>{t("adminWorkflow.assignmentRole")}<select name="assignmentRole"><option value="primary_manager">{t("adminWorkflow.primaryManager")}</option><option value="manager">{t("adminWorkflow.manager")}</option></select></label>
      <button disabled={pending || !workshops.length}>{t("adminWorkflow.createInvitation")}</button><Result state={state} t={t} />
    </form>
  </details>;
}

function ManagerAssignmentForm({ workshops, managers, t }: {
  workshops: AdminOrganisationWorkflow["workshops"]; managers: AdminOrganisationWorkflow["managers"]; t: T;
}) {
  const [state, action, pending] = useActionState(assignLocationManagerAction, initial);
  const activeManagers = managers.filter((manager) => manager.accountStatus === "active" && manager.profileStatus === "active");
  return <details className="admin-workflow-card"><summary><span><strong>{t("adminWorkflow.assignManager")}</strong><small>{t("adminWorkflow.assignManagerHelp")}</small></span></summary>
    <form className="admin-workflow-form" action={action}>
      <label>{t("automotiveAdmin.workshop")}<select name="workshopId" required>{workshops.map((workshop) => <option value={workshop.id} key={workshop.id}>{workshop.displayName}</option>)}</select></label>
      <label>{t("automotiveAdmin.manager")}<select name="managerId" required>{activeManagers.map((manager) => <option value={manager.id} key={manager.id}>{manager.displayName} · {manager.email}</option>)}</select></label>
      <label>{t("adminWorkflow.assignmentRole")}<select name="assignmentRole"><option value="primary_manager">{t("adminWorkflow.primaryManager")}</option><option value="manager">{t("adminWorkflow.manager")}</option></select></label>
      <button disabled={pending || !workshops.length || !activeManagers.length}>{t("adminWorkflow.assignManager")}</button><Result state={state} t={t} />
    </form>
  </details>;
}

export function WorkshopAdministration({ providers, workflow, language, t }: {
  providers: Array<{ id: string; displayName: string; status: string }>;
  workflow: AdminOrganisationWorkflow; language: Language; t: T;
}) {
  const [editingWorkshopId, setEditingWorkshopId] = useState<string | null>(null);
  const editingWorkshop = workflow.workshops.find((workshop) => workshop.id === editingWorkshopId) ?? null;
  return <div className="admin-workflow-stack">
    <LocationForm providers={providers} language={language} t={t} />
    <div className="admin-workflow-grid"><ManagerInviteForm workshops={workflow.workshops.filter((workshop) => workshop.providerId !== null)} t={t} /><ManagerAssignmentForm workshops={workflow.workshops.filter((workshop) => workshop.providerId !== null)} managers={workflow.managers} t={t} /></div>
    <div className="admin-table-card"><table><thead><tr><th>{t("automotiveAdmin.workshop")}</th><th>{t("adminWorkflow.provider")}</th><th>{t("adminWorkflow.primaryManager")}</th><th>{t("adminWorkflow.subscription")}</th><th>{t("adminWorkflow.claim")}</th><th>{t("common.status")}</th><th>{t("adminWorkflow.operation")}</th></tr></thead><tbody>{workflow.workshops.map((workshop) => <tr key={workshop.id}><td><strong>{workshop.displayName}</strong><small>{[workshop.city, workshop.address].filter(Boolean).join(" · ")}</small></td><td>{providers.find((item) => item.id === workshop.providerId)?.displayName ?? t("adminWorkflow.noProvider")}</td><td>{workshop.primaryManagerName ?? t("adminWorkflow.noManager")}</td><td>{workshop.subscriptionStatus}</td><td><span>{t(`adminWorkflow.claimStatus.${workshop.claimStatus}` as TranslationKey)}</span>{workshop.creationSource === "administrator" && workshop.claimStatus !== "claimed" && <Link href={`/workshops/${workshop.id}`}>{t("adminWorkflow.openClaimPage")}</Link>}</td><td>{workshop.status}</td><td><button type="button" className="admin-location-edit-button" onClick={() => setEditingWorkshopId(workshop.id)}>{t("adminWorkflow.editLocation")}</button></td></tr>)}</tbody></table></div>
    {editingWorkshop && <section className="admin-location-editor"><header><div><strong>{t("adminWorkflow.editLocation")}</strong><span>{editingWorkshop.displayName}</span></div><button type="button" onClick={() => setEditingWorkshopId(null)} aria-label={t("common.close")}>×</button></header><LocationEditForm key={editingWorkshop.id} workshop={editingWorkshop} language={language} t={t} /></section>}
  </div>;
}

export function AccountStatusControl({ account, t }: {
  account: AdminOrganisationWorkflow["accounts"][number]; t: T;
}) {
  const [state, action, pending] = useActionState(updatePlatformAccountStatusAction, initial);
  return <form className="admin-account-control" action={action}><input type="hidden" name="authUserId" value={account.authUserId} />
    <select name="status" defaultValue={account.status}><option value="active">{t("adminWorkflow.status.active")}</option><option value="deactivated">{t("adminWorkflow.status.deactivated")}</option><option value="blocked">{t("adminWorkflow.status.blocked")}</option></select>
    <input name="reason" required minLength={2} maxLength={500} placeholder={t("adminWorkflow.reason")} /><button disabled={pending}>{t("adminWorkflow.updateAccount")}</button><Result state={state} t={t} />
  </form>;
}
