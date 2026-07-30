"use client";

import { useActionState } from "react";
import { translate, type Language, type TranslationKey } from "@/app/i18n";
import {
  updateMembershipAction,
  type MembershipState,
} from "./manage-actions";

const initialState: MembershipState = { status: "idle" };

export default function MembershipControl({
  membershipId,
  currentStatus,
  language,
}: {
  membershipId: string;
  currentStatus: string;
  language: Language;
}) {
  const [state, action, pending] = useActionState(
    updateMembershipAction,
    initialState,
  );
  const t = (key: TranslationKey) => translate(language, key);
  const nextStatus = currentStatus === "suspended" ? "active" : "suspended";
  return <form action={action} className="membership-control">
    <input type="hidden" name="membershipId" value={membershipId} />
    <input type="hidden" name="status" value={nextStatus} />
    <button disabled={pending}>{t(`organization.membership.action.${nextStatus}` as TranslationKey)}</button>
    {state.status !== "idle" && state.status !== "saved" && <small>{t(`organization.membership.result.${state.status}` as TranslationKey)}</small>}
  </form>;
}
