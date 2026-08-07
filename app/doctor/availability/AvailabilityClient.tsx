"use client";

import Link from "next/link";
import { useActionState } from "react";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type { DoctorAvailability } from "@/lib/dal/appointments";
import { saveAvailabilityAction, type AvailabilityActionState } from "./actions";

const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const idle: AvailabilityActionState = { status: "idle" };

function DayForm({
  weekday,
  current,
  t,
}: {
  weekday: number;
  current?: DoctorAvailability;
  t: (key: TranslationKey) => string;
}) {
  const [state, action, pending] = useActionState(saveAvailabilityAction, idle);
  return <form className="availability-row" action={action}>
    <input type="hidden" name="weekday" value={weekday} />
    <strong>{t(`availability.day.${days[weekday]}` as TranslationKey)}</strong>
    <label>{t("availability.active")}
      <select name="isActive" defaultValue={current?.isActive === false ? "false" : "true"}>
        <option value="true">{t("common.yes")}</option>
        <option value="false">{t("common.no")}</option>
      </select>
    </label>
    <label>{t("availability.start")}<input name="startTime" type="time" required defaultValue={current?.startTime.slice(0, 5) ?? "09:00"} /></label>
    <label>{t("availability.end")}<input name="endTime" type="time" required defaultValue={current?.endTime.slice(0, 5) ?? "17:00"} /></label>
    <label>{t("availability.duration")}
      <select name="slotDurationMinutes" defaultValue={current?.slotDurationMinutes ?? 30}>
        {[15, 30, 45].map((minutes) => <option value={minutes} key={minutes}>{minutes} {t("availability.minutes")}</option>)}
      </select>
    </label>
    <button disabled={pending}>{t(pending ? "appointments.saving" : "availability.save")}</button>
    {state.status !== "idle" && <small className={state.status === "saved" ? "appointment-success" : "appointment-error"}>
      {t(`availability.feedback.${state.status}` as TranslationKey)}
    </small>}
  </form>;
}

export default function AvailabilityClient({ availability }: { availability: DoctorAvailability[] }) {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  if (!ready) return <main className="organization-shell" aria-busy="true" />;
  return <main className="organization-shell">
    <header className="organization-topbar">
      <strong>pitster</strong>
      <Link href="/doctor/appointments">{t("appointments.title")}</Link>
      <Link href="/doctor">{t("appointments.back")}</Link>
      <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label={t("a11y.languageSelector")}>
        <option value="en">{t("language.en")}</option><option value="de">{t("language.de")}</option>
        <option value="ro">{t("language.ro")}</option><option value="hu">{t("language.hu")}</option>
      </select>
    </header>
    <section className="appointment-content">
      <p className="registration-kicker">{t("availability.eyebrow")}</p>
      <h1>{t("availability.title")}</h1>
      <p>{t("availability.description")}</p>
      <div className="availability-list">
        {days.map((_, weekday) => <DayForm
          key={weekday}
          weekday={weekday}
          current={availability.find((item) => item.weekday === weekday)}
          t={t}
        />)}
      </div>
    </section>
  </main>;
}
