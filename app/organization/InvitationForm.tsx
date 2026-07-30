"use client";

import { useActionState } from "react";
import { translate, type Language, type TranslationKey } from "@/app/i18n";
import {
  createInvitationAction,
  type InvitationState,
} from "./manage-actions";

const initialState: InvitationState = { status: "idle" };

export default function InvitationForm({
  kind,
  clinicId = "",
  language,
}: {
  kind: "clinic_doctor" | "doctor_staff";
  clinicId?: string;
  language: Language;
}) {
  const [state, action, pending] = useActionState(
    createInvitationAction,
    initialState,
  );
  const t = (key: TranslationKey) => translate(language, key);
  return (
    <form className="organization-invite" action={action}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="clinicId" value={clinicId} />
      <input type="hidden" name="language" value={language} />
      <label>{t("organization.invite.email")}<input type="email" name="email" required /></label>
      <button disabled={pending}>{t(pending ? "organization.invite.creating" : `organization.invite.${kind}` as TranslationKey)}</button>
      {state.status !== "idle" && <p className={state.status === "created" ? "note-success" : "note-error"}>{t(`organization.invite.status.${state.status}` as TranslationKey)}</p>}
      {state.link && <p><a href={state.link}>{state.link}</a></p>}
    </form>
  );
}
