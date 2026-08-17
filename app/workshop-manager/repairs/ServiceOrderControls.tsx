"use client";

import { useActionState } from "react";
import type { TranslationKey } from "@/app/i18n";
import type { ManagedRepairWorkflow } from "@/lib/dal/repair-workflows";
import { updateServiceOrderAction, type ServiceOrderActionState } from "./actions";

type Translate = (key: TranslationKey) => string;
const idle: ServiceOrderActionState = { status: "idle" };

export default function ServiceOrderControls({ repair, t }: {
  repair: ManagedRepairWorkflow;
  t: Translate;
}) {
  const [state, action, pending] = useActionState(updateServiceOrderAction, idle);
  return <section className="service-order-controls">
    <header>
      <span>
        <small>{t("serviceOrder.eyebrow")}</small>
        <h3>{t("serviceOrder.title")}</h3>
      </span>
      <b>{repair.serviceOrderNumber ?? t("serviceOrder.pendingNumber")}</b>
    </header>
    <p>{t("serviceOrder.description")}</p>
    {repair.assignedResources.length > 0 && <dl>
      {repair.assignedResources.map((resource) => <div key={resource.id}>
        <dt>{t(`capacity.kind.${resource.kind}` as TranslationKey)}</dt>
        <dd>{resource.name}</dd>
      </div>)}
    </dl>}
    <form action={action}>
      <input type="hidden" name="bookingId" value={repair.id} />
      <label>{t("serviceOrder.mechanicOverride")}
        <input name="mechanicOverride" maxLength={160}
          defaultValue={repair.serviceOrderMechanicOverride ?? ""}
          placeholder={t("serviceOrder.mechanicPlaceholder")} />
        <small>{t("serviceOrder.mechanicHelp")}</small>
      </label>
      <label>{t("serviceOrder.receptionCondition")}
        <textarea name="receptionCondition" rows={3} maxLength={2000}
          defaultValue={repair.vehicleReceptionCondition ?? ""}
          placeholder={t("serviceOrder.receptionPlaceholder")} />
      </label>
      {state.status !== "idle" && <p className={state.status === "saved" ? "note-success" : "note-error"}>
        {t(`serviceOrder.result.${state.status}` as TranslationKey)}
      </p>}
      <div>
        <button disabled={pending}>{t(pending ? "repairLifecycle.saving" : "serviceOrder.save")}</button>
        <a href={`/api/service-orders/${repair.id}`} target="_blank" rel="noreferrer">
          {t("serviceOrder.print")}
        </a>
      </div>
    </form>
  </section>;
}
