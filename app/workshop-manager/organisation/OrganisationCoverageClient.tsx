"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  formatDateTime,
  locales,
  translate,
  type Language,
  type TranslationKey,
} from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { OrganisationCoverage } from "@/lib/dal/organisation-coverage";
import {
  inviteOrganisationManagerAction,
  revokeOrganisationManagerInvitationAction,
  type OrganisationInvitationState,
} from "./actions";
import { FieldHelp, OperationalEmptyState, OperationalIntroduction } from "@/app/guidance/OperationalGuidance";

const idle: OrganisationInvitationState = { status: "idle" };
const money = (language: Language, cents: number, currency: string) =>
  new Intl.NumberFormat(locales[language], { style: "currency", currency })
    .format(cents / 100);

function InvitationResult({ state, t }: {
  state: OrganisationInvitationState;
  t: (key: TranslationKey) => string;
}) {
  if (state.status === "idle") return null;
  const successful = (state.status === "saved" || state.status === "revoked")
    && (!state.emailDelivery || state.emailDelivery === "sent");
  return <div className={successful ? "note-success" : "note-error"} role="status">
    <span>{t(`organisationCoverage.result.${state.status}` as TranslationKey)}</span>
    {state.emailDelivery && <strong>{t(`organisationCoverage.invitationEmail.${state.emailDelivery}` as TranslationKey)}</strong>}
    {state.invitationUrl && <>
      <input value={state.invitationUrl} readOnly aria-label={t("organisationCoverage.invitationLink")} />
      <small>{t(state.emailDelivery === "sent" ? "organisationCoverage.backupLinkHelp" : "organisationCoverage.copyLinkHelp")}</small>
    </>}
  </div>;
}

function RevokeInvitation({ invitationId, t }: {
  invitationId: string;
  t: (key: TranslationKey) => string;
}) {
  const [state, action, pending] = useActionState(
    revokeOrganisationManagerInvitationAction,
    idle,
  );
  return <form action={action} className="coverage-revoke-form">
    <input type="hidden" name="invitationId" value={invitationId} />
    <button disabled={pending}>{t("organisationCoverage.revoke")}</button>
    <InvitationResult state={state} t={t} />
  </form>;
}

export default function OrganisationCoverageClient({ coverage, providers, logoutAction, portalBasePath = "/workshop-manager" }: {
  coverage: OrganisationCoverage;
  providers: Array<{ id: string; displayName: string }>;
  logoutAction: () => Promise<void>;
  portalBasePath?: string;
}) {
  const [language, setLanguage, ready] = useLanguage();
  const [state, invitationAction, pending] = useActionState(
    inviteOrganisationManagerAction,
    idle,
  );
  const t = (key: TranslationKey) => translate(language, key);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  const pendingInvitations = coverage.invitations.filter((item) => item.status === "pending");

  return <main className="organization-shell">
    <header className="organization-topbar">
      <strong>pitster</strong>
      <select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("a11y.languageSelector")}>
        <option value="en">EN</option><option value="de">DE</option>
        <option value="ro">RO</option><option value="hu">HU</option>
      </select>
      <form action={logoutAction}><button>{t("auth.logout")}</button></form>
    </header>
    <section className="organization-content coverage-content">
      <p className="registration-kicker">{t("organisationCoverage.eyebrow")}</p>
      <div className="coverage-title">
        <div><h1>{t("organisationCoverage.title")}</h1><p>{t("organisationCoverage.description")}</p></div>
        {providers.length > 1 && <label>{t("organisationCoverage.organisation")}<select value={coverage.providerId} onChange={(event) => location.assign(`${portalBasePath}${portalBasePath === "/service-organisation" ? "/managers" : "/organisation"}?providerId=${event.target.value}`)}>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}</select></label>}
      </div>
      <OperationalIntroduction
        title={t("operationalGuidance.howTitle")}
        description={t("phase5.managers.intro")}
        outcomeLabel={t("operationalGuidance.whyLabel")}
        outcome={t("phase5.managers.outcome")}
        stepsLabel={t("operationalGuidance.stepsLabel")}
        steps={[t("phase5.managers.step1"), t("phase5.managers.step2"), t("phase5.managers.step3")]}
      />
      <section className="coverage-metrics">
        <article><strong>{coverage.locationCount}</strong><span>{t("organisationCoverage.locations")}</span></article>
        <article><strong>{coverage.coveredLocationCount}</strong><span>{t("organisationCoverage.covered")}</span></article>
        <article><strong>{money(language, coverage.unitMonthlyPriceCents, coverage.currency)}</strong><span>{t("organisationCoverage.perLocation")}</span></article>
        <article><strong>{money(language, coverage.requiredMonthlyCents, coverage.currency)}</strong><span>{t("organisationCoverage.monthlyProjection")}</span></article>
      </section>
      <p className="coverage-note">{t("organisationCoverage.projectionHelp")}</p>

      <section className="coverage-location-grid">
        {coverage.locations.map((workshop) => <article className="coverage-location-card" key={workshop.id}>
          <header><div><h2>{workshop.displayName}</h2><p>{[workshop.city, workshop.address].filter(Boolean).join(" · ")}</p></div><b className={`coverage-badge ${workshop.coverageState}`}>{t(`organisationCoverage.coverage.${workshop.coverageState}` as TranslationKey)}</b></header>
          <dl>
            <div><dt>{t("organisationCoverage.subscription")}</dt><dd>{workshop.subscriptionStatus}</dd></div>
            <div><dt>{t("organisationCoverage.primaryManager")}</dt><dd>{workshop.primaryManagerName ?? t("organisationCoverage.managerMissing")}{workshop.primaryManagerEmail && <small>{workshop.primaryManagerEmail}</small>}</dd></div>
          </dl>
        </article>)}
        {!coverage.locations.length && <OperationalEmptyState mark="L" title={t("organisationCoverage.noLocations")} description={t("phase5.managers.locationsEmpty")} action={<Link href={`${portalBasePath}${portalBasePath === "/service-organisation" ? "/locations" : "/workshops"}`}>{t("phase5.managers.openLocations")}</Link>} />}
      </section>

      <div className="coverage-workflow-grid">
        <section className="coverage-panel">
          <h2>{t("organisationCoverage.inviteTitle")}</h2>
          <p>{t("organisationCoverage.inviteDescription")}</p>
          <form className="coverage-invite-form" action={invitationAction}>
            <label>{t("organisationCoverage.location")}<select name="workshopId" required>{coverage.locations.map((workshop) => <option key={workshop.id} value={workshop.id}>{workshop.displayName}</option>)}</select></label>
            <label>{t("organisationCoverage.managerEmail")}<input name="email" type="email" required /><FieldHelp>{t("phase5.managers.emailHelp")}</FieldHelp></label>
            <label>{t("organisationCoverage.role")}<select name="assignmentRole"><option value="primary_manager">{t("organisationCoverage.primaryManager")}</option><option value="manager">{t("organisationCoverage.supportingManager")}</option></select><FieldHelp>{t("phase5.managers.roleHelp")}</FieldHelp></label>
            <button disabled={pending || !coverage.locations.length}>{t("organisationCoverage.createInvitation")}</button>
            <InvitationResult state={state} t={t} />
          </form>
        </section>
        <section className="coverage-panel">
          <h2>{t("organisationCoverage.pendingTitle")}</h2>
          <p>{t("organisationCoverage.pendingDescription")}</p>
          <div className="coverage-invitations">
            {pendingInvitations.map((invitation) => <article key={invitation.id}><span><strong>{invitation.email}</strong><small>{invitation.workshopName} · {formatDateTime(language, invitation.expiresAt)}</small></span><RevokeInvitation invitationId={invitation.id} t={t} /></article>)}
            {!pendingInvitations.length && <OperationalEmptyState mark="M" title={t("organisationCoverage.noPending")} description={t("phase5.managers.pendingEmpty")} />}
          </div>
        </section>
      </div>
      <Link className="organization-action coverage-billing-link" href={`${portalBasePath}${portalBasePath === "/service-organisation" ? "/billing" : "/invoicing"}?providerId=${coverage.providerId}`}>{t("organisationCoverage.openBilling")}</Link>
    </section>
  </main>;
}
