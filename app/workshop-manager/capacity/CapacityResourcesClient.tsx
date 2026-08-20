"use client";

import Link from "@/app/WorkspaceLink";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useState,
  useTransition,
  type DragEvent,
} from "react";
import PlatformDateTimeInput from "@/app/PlatformDateTimeInput";
import {
  formatDateTime,
  translate,
  type Language,
  type TranslationKey,
} from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { FieldHelp, OperationalEmptyState, OperationalIntroduction } from "@/app/guidance/OperationalGuidance";
import {
  personnelTypes,
  workstationTypes,
  type CapacityResource,
  type WorkshopCapacityLocation,
} from "@/lib/workshop-capacity";
import {
  addCapacityAbsenceAction,
  assignPersonnelWorkstationAction,
  createCapacityResourceAction,
  removeCapacityAbsenceAction,
  setCapacityResourceActiveAction,
  setDailyCapacityAction,
  type CapacityActionState,
} from "./actions";

const idle: CapacityActionState = { status: "idle" };
type Translate = (key: TranslationKey) => string;

function Result({ state, t }: { state: CapacityActionState; t: Translate }) {
  if (state.status === "idle") return null;
  return <p
    className={["saved", "created", "assigned", "removed"].includes(state.status)
      ? "note-success"
      : "note-error"}
    role="status"
  >{t(`capacity.result.${state.status}` as TranslationKey)}</p>;
}

function ResourceForm({
  workshopId,
  category,
  t,
}: {
  workshopId: string;
  category: "personnel" | "workstation";
  t: Translate;
}) {
  const [state, action, pending] = useActionState(createCapacityResourceAction, idle);
  const types = category === "personnel" ? personnelTypes : workstationTypes;
  return <form action={action} className="capacity-add-form">
    <input type="hidden" name="workshopId" value={workshopId} />
    <input type="hidden" name="category" value={category} />
    <label>
      {t(category === "personnel" ? "capacity.personnelType" : "capacity.workstationType")}
      <select name="type">
        {types.map((type) => <option key={type} value={type}>
          {t(`capacity.type.${type}` as TranslationKey)}
        </option>)}
      </select>
    </label>
    <label>
      {t(category === "personnel" ? "capacity.workerName" : "capacity.stationName")}
      <input name="name" required minLength={2} maxLength={120} />
    </label>
    <button disabled={pending}>{t(category === "personnel"
      ? "capacity.addWorker"
      : "capacity.addWorkstation")}</button>
    <Result state={state} t={t} />
  </form>;
}

function AbsenceControls({
  resource,
  language,
  t,
}: {
  resource: CapacityResource;
  language: Language;
  t: Translate;
}) {
  const [state, action, pending] = useActionState(addCapacityAbsenceAction, idle);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  return <details className="capacity-availability">
    <summary>{t("capacity.availability")}</summary>
    {resource.absences.map((absence) => <div className="capacity-absence-item" key={absence.id}>
      <span><strong>{absence.reason || t("capacity.absence")}</strong><small>
        {formatDateTime(language, absence.startsAt)} – {formatDateTime(language, absence.endsAt)}
      </small></span>
      <AbsenceRemove absenceId={absence.id} t={t} />
    </div>)}
    <form action={action} className="capacity-absence-form capacity-page-absence-form">
      <input type="hidden" name="resourceId" value={resource.id} />
      <input type="hidden" name="startsAt" value={startsAt ? new Date(startsAt).toISOString() : ""} />
      <input type="hidden" name="endsAt" value={endsAt ? new Date(endsAt).toISOString() : ""} />
      <label>{t("capacity.absenceStarts")}<PlatformDateTimeInput mode="datetime-local" value={startsAt} onChange={setStartsAt} required ariaLabel={t("capacity.absenceStarts")} /></label>
      <label>{t("capacity.absenceEnds")}<PlatformDateTimeInput mode="datetime-local" value={endsAt} onChange={setEndsAt} required ariaLabel={t("capacity.absenceEnds")} /></label>
      <label>{t("capacity.absenceReason")}<input name="reason" maxLength={240} /></label>
      <button disabled={pending}>{t("capacity.addAbsence")}</button>
      <Result state={state} t={t} />
    </form>
  </details>;
}

function AbsenceRemove({ absenceId, t }: { absenceId: string; t: Translate }) {
  const [state, action, pending] = useActionState(removeCapacityAbsenceAction, idle);
  return <form action={action}>
    <input type="hidden" name="absenceId" value={absenceId} />
    <button disabled={pending}>{t("capacity.remove")}</button>
    <Result state={state} t={t} />
  </form>;
}

function ActiveControl({ resource, t }: { resource: CapacityResource; t: Translate }) {
  const [state, action, pending] = useActionState(setCapacityResourceActiveAction, idle);
  return <form action={action} className="capacity-active-control">
    <input type="hidden" name="resourceId" value={resource.id} />
    <input type="hidden" name="active" value={String(!resource.active)} />
    <button disabled={pending}>{t(resource.active ? "capacity.deactivate" : "capacity.activate")}</button>
    <Result state={state} t={t} />
  </form>;
}

function WorkerCard({
  worker,
  stations,
  language,
  t,
}: {
  worker: CapacityResource;
  stations: CapacityResource[];
  language: Language;
  t: Translate;
}) {
  const [state, setState] = useState<CapacityActionState>(idle);
  const [pending, startTransition] = useTransition();
  const assign = (stationId: string | null) => startTransition(async () => {
    setState(await assignPersonnelWorkstationAction({
      personnelResourceId: worker.id,
      workstationResourceId: stationId,
    }));
  });
  return <article
    className={`capacity-worker-card${worker.active ? "" : " resource-inactive"}`}
    draggable={worker.active}
    onDragStart={(event) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-pitster-personnel", worker.id);
      event.dataTransfer.setData("text/plain", worker.id);
    }}
  >
    <header><div><span>{t(`capacity.type.${worker.type}` as TranslationKey)}</span><h3>{worker.name}</h3></div><ActiveControl resource={worker} t={t} /></header>
    <label className="capacity-station-fallback">
      {t("capacity.assignedTo")}
      <select
        value={worker.assignedStationId ?? ""}
        disabled={pending || !worker.active}
        onChange={(event) => assign(event.target.value || null)}
      >
        <option value="">{t("capacity.unassigned")}</option>
        {stations.filter((station) => station.active).map((station) =>
          <option value={station.id} key={station.id}>{station.name}</option>)}
      </select>
    </label>
    <Result state={state} t={t} />
    <AbsenceControls resource={worker} language={language} t={t} />
  </article>;
}

function WorkstationCard({
  station,
  workers,
  language,
  t,
}: {
  station: CapacityResource;
  workers: CapacityResource[];
  language: Language;
  t: Translate;
}) {
  const [state, setState] = useState<CapacityActionState>(idle);
  const [pending, startTransition] = useTransition();
  const assigned = workers.filter((worker) => worker.assignedStationId === station.id);
  const drop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (!station.active) return;
    const workerId = event.dataTransfer.getData("application/x-pitster-personnel")
      || event.dataTransfer.getData("text/plain");
    if (!workers.some((worker) => worker.id === workerId && worker.active)) return;
    startTransition(async () => setState(await assignPersonnelWorkstationAction({
      personnelResourceId: workerId,
      workstationResourceId: station.id,
    })));
  };
  return <article
    className={`capacity-station-card${station.active ? "" : " resource-inactive"}${pending ? " assigning" : ""}`}
    onDragOver={(event) => {
      if (station.active) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }
    }}
    onDrop={drop}
  >
    <header><div><span>{t(`capacity.type.${station.type}` as TranslationKey)}</span><h3>{station.name}</h3></div><ActiveControl resource={station} t={t} /></header>
    <div className="capacity-station-dropzone">
      <span>{t("capacity.dropHere")}</span>
      {assigned.length > 0
        ? assigned.map((worker) => <b key={worker.id}>{worker.name}</b>)
        : <small>{t("capacity.noAssignedWorkers")}</small>}
    </div>
    <Result state={state} t={t} />
    <AbsenceControls resource={station} language={language} t={t} />
  </article>;
}

function UnassignedDropzone({ workers, t }: { workers: CapacityResource[]; t: Translate }) {
  const [state, setState] = useState<CapacityActionState>(idle);
  const [pending, startTransition] = useTransition();
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const workerId = event.dataTransfer.getData("application/x-pitster-personnel")
      || event.dataTransfer.getData("text/plain");
    if (!workers.some((worker) => worker.id === workerId)) return;
    startTransition(async () => setState(await assignPersonnelWorkstationAction({
      personnelResourceId: workerId,
      workstationResourceId: null,
    })));
  };
  return <div className={`capacity-unassigned-dropzone${pending ? " assigning" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={drop}>
    <span>{t("capacity.unassignedDrop")}</span>
    <Result state={state} t={t} />
  </div>;
}

function DailyCapacityForm({ location, t }: { location: WorkshopCapacityLocation; t: Translate }) {
  const [state, action, pending] = useActionState(setDailyCapacityAction, idle);
  return <form action={action} className="capacity-daily-form">
    <input type="hidden" name="workshopId" value={location.workshopId} />
    <label>{t("capacity.dailyCapacity")}<input name="dailyCapacity" type="number" min={1} max={200} defaultValue={location.dailyCapacity} required /></label>
    <button disabled={pending}>{t("capacity.saveDailyCapacity")}</button>
    <Result state={state} t={t} />
  </form>;
}

export default function CapacityResourcesClient({
  locations,
  selectedWorkshopId,
  requireLocationSelection,
  portalBasePath,
  logoutAction,
}: {
  locations: WorkshopCapacityLocation[];
  selectedWorkshopId: string | null;
  requireLocationSelection: boolean;
  portalBasePath: "/workshop-manager" | "/service-organisation";
  logoutAction: () => Promise<void>;
}) {
  const router = useRouter();
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  const selected = locations.find((location) => location.workshopId === selectedWorkshopId) ?? null;
  if (!ready) return <main className="registration-shell" aria-busy="true" />;

  const selectLocation = (workshopId: string) => {
    const path = `${portalBasePath}/capacity`;
    router.push(workshopId ? `${path}?workshopId=${workshopId}` : path);
  };
  const workers = selected?.resources.filter((item) => item.category === "personnel") ?? [];
  const stations = selected?.resources.filter((item) => item.category === "workstation") ?? [];

  return <main className="settings-shell capacity-page-shell">
    <header className="settings-topbar"><Link href={portalBasePath}>← {t("workspace.back")}</Link><strong>pitster</strong><select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("a11y.languageSelector")}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select><form action={logoutAction}><button>{t("auth.logout")}</button></form></header>
    <section className="settings-content capacity-page-content">
      <p className="registration-kicker">{t("capacity.page.eyebrow")}</p>
      <h1>{t("capacity.page.title")}</h1>
      <p>{t("capacity.page.description")}</p>
      <OperationalIntroduction title={t("operationalGuidance.howTitle")} description={t("phase3.capacity.intro")} outcomeLabel={t("operationalGuidance.whyLabel")} outcome={t("phase3.capacity.outcome")} stepsLabel={t("operationalGuidance.stepsLabel")} steps={[t("phase3.capacity.step1"), t("phase3.capacity.step2"), t("phase3.capacity.step3")]} />

      <section className="capacity-location-selector">
        <label>{t("capacity.selectLocation")}<select value={selected?.workshopId ?? ""} onChange={(event) => selectLocation(event.target.value)}>
          {requireLocationSelection && <option value="">{t("capacity.selectLocationPrompt")}</option>}
          {locations.map((location) => <option value={location.workshopId} key={location.workshopId}>{location.workshopName}{location.city ? ` · ${location.city}` : ""}</option>)}
        </select></label>
        {selected && <DailyCapacityForm location={selected} t={t} />}
      </section>

      {!selected ? <OperationalEmptyState mark="L" title={t("capacity.selectLocationPrompt")} description={locations.length ? t("capacity.selectLocationHelp") : t("workshopOperations.emptyDescription")} /> : <>
        <header className="capacity-location-heading"><span>{t("capacity.currentLocation")}</span><h2>{selected.workshopName}</h2>{selected.city && <p>{selected.city}</p>}</header>
        <p className="capacity-drag-help">{t("capacity.dragHelp")}</p>
        <FieldHelp>{t("phase3.capacity.assignmentHelp")}</FieldHelp>
        <div className="capacity-split-layout">
          <section className="capacity-column capacity-personnel-column">
            <header><span>P</span><div><h2>{t("capacity.personnel.title")}</h2><p>{t("capacity.personnel.description")}</p></div></header>
            <ResourceForm workshopId={selected.workshopId} category="personnel" t={t} />
            <UnassignedDropzone workers={workers} t={t} />
            <div className="capacity-card-list">
              {workers.map((worker) => <WorkerCard key={worker.id} worker={worker} stations={stations} language={language} t={t} />)}
              {!workers.length && <OperationalEmptyState mark="P" title={t("capacity.noPersonnel")} description={t("capacity.noPersonnelHelp")} />}
            </div>
          </section>
          <section className="capacity-column capacity-workstation-column">
            <header><span>W</span><div><h2>{t("capacity.workstations.title")}</h2><p>{t("capacity.workstations.description")}</p></div></header>
            <ResourceForm workshopId={selected.workshopId} category="workstation" t={t} />
            <div className="capacity-card-list">
              {stations.map((station) => <WorkstationCard key={station.id} station={station} workers={workers} language={language} t={t} />)}
              {!stations.length && <OperationalEmptyState mark="W" title={t("capacity.noWorkstations")} description={t("capacity.noWorkstationsHelp")} />}
            </div>
          </section>
        </div>
      </>}
    </section>
  </main>;
}
