"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import GoogleAddressSearch from "@/app/GoogleAddressSearch";
import { formatDateTime, type Language, type TranslationKey } from "@/app/i18n";
import type { AdminDashboardData } from "@/lib/dal/admin";
import type { AdminOrganisationWorkflow } from "@/lib/dal/admin-organisations";
import {
  assignLocationManagerAction,
  assignServiceProviderLocationAction,
  createWorkshopLocationAction,
  deleteServiceProviderOrganisationAction,
  inviteLocationManagerAction,
  inviteServiceOrganisationAction,
  resendServiceOrganisationInvitationAction,
  setServiceProviderStatusAction,
  updateServiceProviderOrganisationAction,
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
  const successful = (state.status === "saved" || state.status === "resent")
    && (!state.emailDelivery || state.emailDelivery === "sent");
  return <div className={successful ? "note-success" : "note-error"} role="status">
    <span>{t(`adminWorkflow.result.${state.status}` as TranslationKey)}</span>
    {state.emailDelivery && <strong>{t(`adminWorkflow.invitationEmail.${state.emailDelivery}` as TranslationKey)}</strong>}
    {state.emailDiagnostic && <small className="admin-email-diagnostic">{t("adminWorkflow.mxrouteResponse")}: {state.emailDiagnostic}</small>}
    {state.invitationUrl && <><input value={state.invitationUrl} readOnly aria-label={t("adminWorkflow.invitationLink")} /><small>{t(state.emailDelivery === "sent" ? "adminWorkflow.backupLinkHelp" : "adminWorkflow.copyLinkHelp")}</small></>}
  </div>;
}

function ResendOrganisationInvitation({ invitationId, t }: {
  invitationId: string; t: T;
}) {
  const [state, action, pending] = useActionState(
    resendServiceOrganisationInvitationAction,
    initial,
  );
  return <>
    <form className="admin-invitation-resend" action={action}>
      <input type="hidden" name="invitationId" value={invitationId} />
      <button disabled={pending}>{t("adminWorkflow.resendInvitation")}</button>
    </form>
    <Result state={state} t={t} />
  </>;
}

export function OrganisationAdministration({ providers, invitations, t }: {
  providers: Array<{ id: string; displayName: string; status: string }>;
  invitations: AdminOrganisationWorkflow["invitations"]; t: T;
}) {
  const [state, action, pending] = useActionState(inviteServiceOrganisationAction, initial);
  const pendingInvitations = invitations.filter((item) =>
    item.status === "pending" && item.kind === "organisation_owner");
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
      <div className="admin-invitation-list">{pendingInvitations.map((item) => <article key={item.id}><span><strong>{item.email}</strong><small>{item.providerName}</small></span><b>{item.kind}</b><ResendOrganisationInvitation invitationId={item.id} t={t} /></article>)}{!pendingInvitations.length && <p>{t("adminWorkflow.noPendingInvitations")}</p>}</div>
    </section>
    <section className="admin-workflow-card"><h3>{t("adminWorkflow.organisationSummary")}</h3><p>{providers.length} {t("automotiveAdmin.providers")}</p></section>
  </div>;
}

function ProviderAccordionRow({ provider, summary, workflow, language, t }: {
  provider: AdminOrganisationWorkflow["providers"][number];
  summary: AdminDashboardData["providers"][number] | undefined;
  workflow: AdminOrganisationWorkflow; language: Language; t: T;
}) {
  const [editState, editAction, editPending] = useActionState(updateServiceProviderOrganisationAction, initial);
  const [coverageState, coverageAction, coveragePending] = useActionState(assignServiceProviderLocationAction, initial);
  const [statusState, statusAction, statusPending] = useActionState(setServiceProviderStatusAction, initial);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteServiceProviderOrganisationAction, initial);
  const coveredLocations = workflow.workshops.filter((workshop) => workshop.providerId === provider.id);
  const unownedLocations = workflow.workshops.filter((workshop) => workshop.providerId === null);
  const targetStatus = provider.status === "suspended" ? "active" : "suspended";
  return <details className="admin-provider-accordion">
    <summary>
      <span><strong>{provider.displayName}</strong><small>{provider.mainEmail ?? provider.billingProfile.billingEmail ?? "—"}</small></span>
      <span>{provider.legalName}</span>
      <b className={`admin-status ${provider.status}`}>{t(`commercialAdmin.providerStatus.${provider.status}` as TranslationKey)}</b>
      <span>{summary?.workshopCount ?? coveredLocations.length}</span>
      <span>{summary?.managerCount ?? 0}</span>
      <span>{formatDateTime(language, provider.createdAt)}</span>
      <i aria-hidden="true">⌄</i>
    </summary>
    <div className="admin-provider-details">
      <section>
        <header><h3>{t("adminProvider.companyDetails")}</h3><p>{t("adminProvider.companyDetailsHelp")}</p></header>
        <form className="admin-provider-edit-form" action={editAction}>
          <input type="hidden" name="providerId" value={provider.id} />
          <label>{t("adminWorkflow.legalName")}<input name="legalName" required minLength={2} maxLength={200} defaultValue={provider.legalName} /></label>
          <label>{t("adminWorkflow.displayName")}<input name="displayName" required minLength={2} maxLength={160} defaultValue={provider.displayName} /></label>
          <label>{t("adminProvider.mainEmail")}<input name="mainEmail" type="email" maxLength={320} defaultValue={provider.mainEmail ?? ""} /></label>
          <label>{t("adminWorkflow.country")}<input name="countryCode" required pattern="[A-Za-z]{2}" maxLength={2} defaultValue={provider.countryCode} /></label>
          <h4>{t("adminProvider.billingDetails")}</h4>
          <label>{t("adminProvider.billingEmail")}<input name="billingEmail" type="email" maxLength={320} defaultValue={provider.billingProfile.billingEmail ?? ""} /></label>
          <label>{t("adminProvider.billingContact")}<input name="billingContact" minLength={2} maxLength={160} defaultValue={provider.billingProfile.billingContact ?? ""} /></label>
          <label>{t("adminProvider.fiscalIdentifier")}<input name="taxIdentifier" minLength={2} maxLength={80} defaultValue={provider.billingProfile.taxIdentifier ?? ""} /></label>
          <label>{t("adminProvider.vatNumber")}<input name="vatIdentifier" minLength={2} maxLength={80} defaultValue={provider.billingProfile.vatIdentifier ?? ""} /></label>
          <label>{t("adminProvider.registrationNumber")}<input name="registrationNumber" minLength={2} maxLength={80} defaultValue={provider.billingProfile.registrationNumber ?? ""} /></label>
          <label>{t("adminProvider.addressLine1")}<input name="addressLine1" minLength={3} maxLength={240} defaultValue={provider.billingProfile.addressLine1 ?? ""} /></label>
          <label>{t("adminProvider.addressLine2")}<input name="addressLine2" minLength={2} maxLength={240} defaultValue={provider.billingProfile.addressLine2 ?? ""} /></label>
          <label>{t("adminProvider.city")}<input name="city" minLength={2} maxLength={120} defaultValue={provider.billingProfile.city ?? ""} /></label>
          <label>{t("adminProvider.postalCode")}<input name="postalCode" minLength={2} maxLength={24} defaultValue={provider.billingProfile.postalCode ?? ""} /></label>
          <label>{t("adminProvider.billingCountry")}<input name="billingCountryCode" required pattern="[A-Za-z]{2}" maxLength={2} defaultValue={provider.billingProfile.countryCode} /></label>
          <button disabled={editPending}>{t("common.save")}</button>
          <Result state={editState} t={t} />
        </form>
      </section>
      <section>
        <header><h3>{t("adminProvider.coveredLocations")}</h3><p>{t("adminProvider.coveredLocationsHelp")}</p></header>
        <div className="admin-provider-location-list">{coveredLocations.map((workshop) => <article key={workshop.id}><span><strong>{workshop.displayName}</strong><small>{[workshop.city, workshop.address].filter(Boolean).join(" · ")}</small></span><b>{workshop.subscriptionStatus}</b></article>)}{!coveredLocations.length && <p>{t("adminProvider.noCoveredLocations")}</p>}</div>
        <form className="admin-provider-coverage-form" action={coverageAction}>
          <input type="hidden" name="providerId" value={provider.id} />
          <label>{t("adminProvider.assignLocation")}<select name="workshopId" required defaultValue=""><option value="" disabled>{t("adminProvider.chooseUnownedLocation")}</option>{unownedLocations.map((workshop) => <option key={workshop.id} value={workshop.id}>{workshop.displayName} · {workshop.city ?? "—"}</option>)}</select></label>
          <button disabled={coveragePending || !unownedLocations.length}>{t("adminProvider.assignLocation")}</button>
          <Result state={coverageState} t={t} />
        </form>
      </section>
      <section className="admin-provider-controls">
        <header><h3>{t("adminProvider.accountControls")}</h3><p>{t("adminProvider.accountControlsHelp")}</p></header>
        <form action={statusAction}>
          <input type="hidden" name="providerId" value={provider.id} />
          <input type="hidden" name="status" value={targetStatus} />
          <label>{t("adminWorkflow.reason")}<input name="reason" required minLength={2} maxLength={500} /></label>
          <button disabled={statusPending} className={targetStatus === "suspended" ? "danger" : ""}>{targetStatus === "suspended" ? t("adminProvider.suspend") : t("adminProvider.restore")}</button>
          <Result state={statusState} t={t} />
        </form>
        <div className="admin-provider-delete">
          <h4>{t("adminProvider.deleteOrganisation")}</h4>
          <p>{t("adminProvider.deleteHelp")}</p>
          {!provider.canDelete && <p className="note-error">{t("adminProvider.deleteBlocked")} {provider.deleteBlockers.map((blocker) => t(`adminProvider.blocker.${blocker}` as TranslationKey)).join(", ")}</p>}
          {provider.canDelete && <form action={deleteAction}>
            <input type="hidden" name="providerId" value={provider.id} />
            <label>{t("adminProvider.confirmName")}<input name="confirmation" required placeholder={provider.displayName} autoComplete="off" /></label>
            <label>{t("adminWorkflow.reason")}<input name="reason" required minLength={2} maxLength={500} /></label>
            <button disabled={deletePending} className="danger">{t("adminProvider.deleteOrganisation")}</button>
            <Result state={deleteState} t={t} />
          </form>}
        </div>
      </section>
    </div>
  </details>;
}

export function ProviderAdministration({ providers, workflow, language, t }: {
  providers: AdminDashboardData["providers"];
  workflow: AdminOrganisationWorkflow; language: Language; t: T;
}) {
  return <div className="admin-provider-list">
    <div className="admin-provider-list-head"><span>{t("automotiveAdmin.provider")}</span><span>{t("automotiveAdmin.legalName")}</span><span>{t("common.status")}</span><span>{t("automotiveAdmin.workshops")}</span><span>{t("automotiveAdmin.managers")}</span><span>{t("automotiveAdmin.created")}</span><span /></div>
    {workflow.providers.map((provider) => <ProviderAccordionRow key={provider.id} provider={provider} summary={providers.find((item) => item.id === provider.id)} workflow={workflow} language={language} t={t} />)}
    {!workflow.providers.length && <p className="admin-empty">{t("automotiveAdmin.empty")}</p>}
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
