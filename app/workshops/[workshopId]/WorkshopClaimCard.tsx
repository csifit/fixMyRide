"use client";

import Link from "next/link";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { PublicWorkshopClaim } from "@/lib/dal/workshop-claims";
import { beginWorkshopClaimAction } from "./claim/actions";

export default function WorkshopClaimCard({ claim, notice, compact = false, ownerProviders = [], registrationRequired = false }: {
  claim: PublicWorkshopClaim;
  notice: string | null;
  compact?: boolean;
  ownerProviders?: Array<{ id: string; displayName: string }>;
  registrationRequired?: boolean;
}) {
  const [language, , ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  if (!ready) return <section className="workshop-claim-card" aria-busy="true" />;
  const claimed = claim.status === "claimed";
  const messageKey = notice && ["account_required", "unauthorized", "unavailable", "claimed"].includes(notice)
    ? `workshopClaim.notice.${notice}` as TranslationKey
    : null;
  const claimControl = registrationRequired
    ? <Link className="workshop-claim-registration" href="/register/workshop-manager">{t("workshopClaim.button")}</Link>
    : <form action={beginWorkshopClaimAction} className="workshop-claim-form"><input type="hidden" name="workshopId" value={claim.workshopId} />{!claim.serviceProviderId && ownerProviders.length > 0 && <label>{t("workshopClaim.chooseOrganisation")}<select name="providerId" required defaultValue=""><option value="" disabled>{t("workshopClaim.chooseOrganisationPlaceholder")}</option>{ownerProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}</select></label>}<button>{t(claim.status === "awaiting_payment" ? "workshopClaim.continue" : "workshopClaim.button")}</button></form>;
  if (compact) return <section className="workshop-claim-card compact">
    <span>{t("workshopClaim.kicker")}</span>
    <h2>{t("workshopClaim.title")}</h2>
    <p>{t("workshopClaim.description")}</p>
    {messageKey && <p className={notice === "claimed" ? "note-success" : "note-error"}>{t(messageKey)}</p>}
    <details><summary>{t("workshopClaim.continue")}</summary><ol><li>{t("workshopClaim.step.owner")}</li><li>{t("workshopClaim.step.details")}</li><li>{t("workshopClaim.step.payment")}</li></ol></details>
    {claimControl}
  </section>;
  return <section className={`workshop-claim-card${compact ? " compact" : ""}`}>
    <span>{t(claimed ? "workshopClaim.claimedKicker" : "workshopClaim.kicker")}</span>
    <h1>{claim.displayName}</h1>
    <p>{[claim.address, claim.city, claim.countryCode].filter(Boolean).join(", ")}</p>
    <strong>{claim.serviceProviderName ?? t("workshopClaim.unassignedOrganisation")}</strong>
    <h2>{t(claimed ? "workshopClaim.claimedTitle" : "workshopClaim.title")}</h2>
    <p>{t(claimed ? "workshopClaim.claimedDescription" : "workshopClaim.description")}</p>
    {messageKey && <p className={notice === "claimed" ? "note-success" : "note-error"}>{t(messageKey)}</p>}
    {!claimed && <>
      <ol><li>{t("workshopClaim.step.owner")}</li><li>{t("workshopClaim.step.details")}</li><li>{t("workshopClaim.step.payment")}</li></ol>
      {claimControl}
    </>}
    <Link href="/workshops">{t("workshopClaim.back")}</Link>
  </section>;
}
