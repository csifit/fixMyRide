"use client";

import { useState, useTransition } from "react";
import type { TranslationKey } from "@/app/i18n";
import type { ManagedWorkshopBooking } from "@/lib/dal/workshop-bookings";
import type { BookingResource, WorkshopSchedule } from "@/lib/dal/workshop-scheduling";
import { saveBookingScheduleAction, type ScheduleActionState } from "./actions";
import PlatformDateTimeInput from "@/app/PlatformDateTimeInput";
import { FieldHelp } from "@/app/guidance/OperationalGuidance";

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
