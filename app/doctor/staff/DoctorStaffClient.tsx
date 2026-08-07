"use client";

import Link from "next/link";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import InvitationForm from "../../organization/InvitationForm";

export default function DoctorStaffClient({
  assignments,
  logoutAction,
}: {
  assignments: Array<{
    id: string;
    status: string;
    staff_profiles: { id: string; display_name: string; status: string } | null;
  }>;
  logoutAction: () => Promise<void>;
}) {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  if (!ready) return <main className="organization-shell" aria-busy="true" />;
  return <main className="organization-shell"><header className="organization-topbar"><Link href="/doctor">← pitster</Link><select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}><option value="en">{t("language.en")}</option><option value="de">{t("language.de")}</option><option value="ro">{t("language.ro")}</option><option value="hu">{t("language.hu")}</option></select><form action={logoutAction}><button>{t("auth.logout")}</button></form></header><section className="organization-content"><p className="registration-kicker">{t("organization.staff.eyebrow")}</p><h1>{t("organization.staffManagement.title")}</h1><p>{t("organization.staff.securityNote")}</p><article className="organization-card"><InvitationForm kind="doctor_staff" language={language} /></article>{assignments.map((assignment) => <article className="organization-card" key={assignment.id}><strong>{assignment.staff_profiles?.display_name ?? t("organization.staff.eyebrow")}</strong><p>{t(`organization.membership.${assignment.status}` as TranslationKey)}</p></article>)}</section></main>;
}
