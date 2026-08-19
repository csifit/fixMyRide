"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "@/app/WorkspaceLink";
import type { Language, TranslationKey } from "@/app/i18n";
import type { ManagedWorkshopBooking } from "@/lib/dal/workshop-bookings";
import type { BookingResource, WorkshopSchedule } from "@/lib/dal/workshop-scheduling";
import {
  addScheduleResourceAbsenceAction,
  createScheduleResourceAction,
  removeScheduleResourceAbsenceAction,
  saveBookingScheduleAction,
  setScheduleResourceActiveAction,
  type ScheduleActionState,
} from "./actions";
import PlatformDateTimeInput from "@/app/PlatformDateTimeInput";
import { FieldHelp, OperationalEmptyState, OperationalIntroduction } from "@/app/guidance/OperationalGuidance";

type Translate = (key: TranslationKey) => string;
const idle: ScheduleActionState = { status: "idle" };
const localInput = (value: string) => {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

function Result({ state, t }: { state: ScheduleActionState; t: Translate }) {
  if (state.status === "idle") return null;
  return <p className={["saved", "created", "removed"].includes(state.status) ? "note-success" : "note-error"} role="status">
    {t(`capacity.result.${state.status}` as TranslationKey)}
  </p>;
}

function ResourceForm({ schedule, t }: { schedule: WorkshopSchedule; t: Translate }) {
  const [state, action, pending] = useActionState(createScheduleResourceAction, idle);
  return <form action={action} className="capacity-resource-form" id={`resource-form-${schedule.workshopId}`}>
    <input type="hidden" name="workshopId" value={schedule.workshopId} />
    <label>{t("capacity.resourceType")}<select name="kind"><option value="mechanic">{t("capacity.kind.mechanic")}</option><option value="bay">{t("capacity.kind.bay")}</option><option value="ramp">{t("capacity.kind.ramp")}</option></select><FieldHelp>{t("phase3.capacity.typeHelp")}</FieldHelp></label>
    <label>{t("capacity.resourceName")}<input name="name" required minLength={2} maxLength={120} /><FieldHelp>{t("phase3.capacity.nameHelp")}</FieldHelp></label>
    <button disabled={pending}>{t("capacity.addResource")}</button><Result state={state} t={t} />
  </form>;
}

function AbsenceForm({ resourceId, t }: { resourceId: string; t: Translate }) {
  const [state, action, pending] = useActionState(addScheduleResourceAbsenceAction, idle);
  const [startsAt, setStartsAt] = useState(""); const [endsAt, setEndsAt] = useState("");
  return <form action={action} className="capacity-absence-form">
    <input type="hidden" name="resourceId" value={resourceId} />
    <input type="hidden" name="startsAt" value={startsAt ? new Date(startsAt).toISOString() : ""} />
    <input type="hidden" name="endsAt" value={endsAt ? new Date(endsAt).toISOString() : ""} />
    <label>{t("capacity.absenceStarts")}<PlatformDateTimeInput mode="datetime-local" value={startsAt} onChange={setStartsAt} required ariaLabel={t("capacity.absenceStarts")} /></label>
    <label>{t("capacity.absenceEnds")}<PlatformDateTimeInput mode="datetime-local" value={endsAt} onChange={setEndsAt} required ariaLabel={t("capacity.absenceEnds")} /></label>
    <label>{t("capacity.absenceReason")}<input name="reason" maxLength={240} /><FieldHelp>{t("phase3.capacity.absenceHelp")}</FieldHelp></label>
    <button disabled={pending}>{t("capacity.addAbsence")}</button><Result state={state} t={t} />
  </form>;
}

function ResourceRow({ resource, language, t }: { resource: WorkshopSchedule["resources"][number]; language: Language; t: Translate }) {
  const [activeState, activeAction, activePending] = useActionState(setScheduleResourceActiveAction, idle);
  return <article className={!resource.active ? "resource-inactive" : ""}>
    <header><div><span>{t(`capacity.kind.${resource.kind}` as TranslationKey)}</span><strong>{resource.name}</strong></div><form action={activeAction}><input type="hidden" name="resourceId" value={resource.id} /><input type="hidden" name="active" value={String(!resource.active)} /><button disabled={activePending}>{t(resource.active ? "capacity.deactivate" : "capacity.activate")}</button></form></header>
    <Result state={activeState} t={t} />
    <div className="capacity-absence-list">{resource.absences.map((absence) => <div key={absence.id}><span><b>{absence.reason || t("capacity.absence")}</b><small>{new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(absence.startsAt))} - {new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(absence.endsAt))}</small></span><AbsenceRemove absenceId={absence.id} t={t} /></div>)}</div>
    {resource.active && <AbsenceForm resourceId={resource.id} t={t} />}
  </article>;
}

function AbsenceRemove({ absenceId, t }: { absenceId: string; t: Translate }) {
  const [state, action, pending] = useActionState(removeScheduleResourceAbsenceAction, idle);
  return <form action={action}><input type="hidden" name="absenceId" value={absenceId} /><button disabled={pending}>{t("capacity.remove")}</button><Result state={state} t={t} /></form>;
}

export function WorkshopCapacityPanel({ schedules, language, t }: { schedules: WorkshopSchedule[]; language: Language; t: Translate }) {
  return <details className="capacity-panel" id="capacity"><summary><span><strong>{t("capacity.title")}</strong><small>{t("capacity.description")}</small></span><b>+</b></summary><div className="capacity-panel-body"><OperationalIntroduction title={t("operationalGuidance.howTitle")} description={t("phase3.capacity.intro")} outcomeLabel={t("operationalGuidance.whyLabel")} outcome={t("phase3.capacity.outcome")} stepsLabel={t("operationalGuidance.stepsLabel")} steps={[t("phase3.capacity.step1"), t("phase3.capacity.step2"), t("phase3.capacity.step3")]} />{schedules.map((schedule) => <section key={schedule.workshopId}><header><div><h3>{schedule.workshopName}</h3><p>{t("capacity.dailyCapacity")}: {schedule.dailyCapacity}</p></div></header><ResourceForm schedule={schedule} t={t} /><div className="capacity-resource-list">{schedule.resources.map((resource) => <ResourceRow key={resource.id} resource={resource} language={language} t={t} />)}{!schedule.resources.length && <OperationalEmptyState mark="R" title={t("capacity.noResources")} description={t("phase3.capacity.emptyDescription")} action={<a href={`#resource-form-${schedule.workshopId}`}>+ {t("capacity.addResource")}</a>} />}</div></section>)}{!schedules.length && <OperationalEmptyState mark="W" title={t("workshopOperations.emptyTitle")} description={t("workshopOperations.emptyDescription")} action={<Link href="/workshop-manager/workshops">{t("serviceCatalogue.manageWorkshops")}</Link>} />}</div></details>;
}

export function BookingScheduleEditor({ booking, schedule, assigned, t }: { booking: ManagedWorkshopBooking; schedule: WorkshopSchedule | undefined; assigned: BookingResource[]; t: Translate }) {
  const [start, setStart] = useState(localInput(booking.confirmedStart ?? booking.preferredStart));
  const [duration, setDuration] = useState(booking.durationMinutes);
  const [mechanicId, setMechanicId] = useState(assigned.find((item) => item.kind === "mechanic")?.id ?? "");
  const [facilityId, setFacilityId] = useState(assigned.find((item) => item.kind !== "mechanic")?.id ?? "");
  const [state, setState] = useState<ScheduleActionState>(idle);
  const [pending, startTransition] = useTransition();
  const resources = schedule?.resources.filter((resource) => resource.active) ?? [];
  const save = () => startTransition(async () => setState(await saveBookingScheduleAction({ bookingId: booking.id, start: new Date(start).toISOString(), durationMinutes: duration, mechanicId: mechanicId || null, facilityId: facilityId || null })));
  return <section className="booking-schedule-editor"><h4>{t("capacity.assignment")}</h4><FieldHelp>{t("phase3.capacity.assignmentHelp")}</FieldHelp><div>
    <label>{t("workshopBookings.action.time")}<PlatformDateTimeInput mode="datetime-local" value={start} onChange={setStart} ariaLabel={t("workshopBookings.action.time")} /></label>
    <label>{t("calendar.duration")}<input type="number" min={15} max={1440} step={15} value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label>
    <label>{t("capacity.kind.mechanic")}<select value={mechanicId} onChange={(event) => setMechanicId(event.target.value)}><option value="">{t("capacity.unassigned")}</option>{resources.filter((item) => item.kind === "mechanic").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>{t("capacity.facility")}<select value={facilityId} onChange={(event) => setFacilityId(event.target.value)}><option value="">{t("capacity.unassigned")}</option>{resources.filter((item) => item.kind !== "mechanic").map((item) => <option key={item.id} value={item.id}>{item.name} ({t(`capacity.kind.${item.kind}` as TranslationKey)})</option>)}</select></label>
  </div><button type="button" onClick={save} disabled={pending || !start}>{t(pending ? "repairLifecycle.saving" : "capacity.saveAssignment")}</button><Result state={state} t={t} /></section>;
}
