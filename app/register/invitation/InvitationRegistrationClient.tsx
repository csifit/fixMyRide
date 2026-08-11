"use client";

import Link from "next/link";
import { useActionState } from "react";
import { translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { registerInvitationAction, type InvitationRegistrationState } from "./actions";

const initial: InvitationRegistrationState = { status: "idle" };

export default function InvitationRegistrationClient({ invitation }: {
  invitation: { id: string; token: string; email: string; kind: string; providerName: string; workshopName: string | null };
}) {
  const [language, setLanguage, ready] = useLanguage();
  const [state, action, pending] = useActionState(registerInvitationAction, initial);
  const t = (key: TranslationKey) => translate(language, key);
  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  const owner = invitation.kind === "organisation_owner";
  return <main className="registration-shell"><section className="registration-card">
    <header className="registration-header"><Link href="/">pitster</Link><select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("a11y.languageSelector")}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select></header>
    <p className="registration-kicker">{t("invitation.kicker")}</p>
    <h1>{t(owner ? "invitation.ownerTitle" : "invitation.managerTitle")}</h1>
    <p>{t(owner ? "invitation.ownerDescription" : "invitation.managerDescription")}</p>
    <div className="invitation-summary"><strong>{invitation.providerName}</strong>{invitation.workshopName && <span>{invitation.workshopName}</span>}</div>
    <form action={action}>
      <input type="hidden" name="invitationId" value={invitation.id} /><input type="hidden" name="token" value={invitation.token} />
      <label>{t("invitation.fullName")}<input name="fullName" required minLength={2} maxLength={160} autoComplete="name" /></label>
      <label>{t("invitation.email")}<input name="email" type="email" value={invitation.email} readOnly /></label>
      {state.status !== "idle" && <p className="note-error" role="status">{t(`invitation.status.${state.status}` as TranslationKey)}</p>}
      <button disabled={pending}>{t(pending ? "invitation.submitting" : "invitation.submit")}</button>
    </form><Link href="/">{t("invitation.back")}</Link>
  </section></main>;
}
