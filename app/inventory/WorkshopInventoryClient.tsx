"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { locales, translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import type {
  WorkshopInventory,
  WorkshopInventoryItem,
  WorkshopInventoryUnit,
} from "@/lib/dal/workshop-inventory";
import {
  createInventoryItemAction,
  updateInventoryItemAction,
  type InventoryActionState,
} from "./actions";

type Translate = (key: TranslationKey) => string;
type StockFilter = "all" | "available" | "low" | "out";
const idle: InventoryActionState = { status: "idle" };
const units: WorkshopInventoryUnit[] = ["piece", "litre", "kilogram", "set", "pack"];
const noItems: WorkshopInventoryItem[] = [];

function stockState(item: WorkshopInventoryItem): Exclude<StockFilter, "all"> {
  if (item.quantity === 0) return "out";
  if (item.minimumQuantity > 0 && item.quantity <= item.minimumQuantity) return "low";
  return "available";
}

function quantityText(language: Language, value: number, unit: WorkshopInventoryUnit, t: Translate) {
  return `${new Intl.NumberFormat(locales[language], { maximumFractionDigits: 2 }).format(value)} ${t(`inventory.unit.${unit}` as TranslationKey)}`;
}

function Result({ state, t }: { state: InventoryActionState; t: Translate }) {
  if (state.status === "idle") return null;
  const success = state.status === "created" || state.status === "saved";
  return <p role="status" className={success ? "note-success" : "note-error"}>
    {t(`inventory.status.${state.status}` as TranslationKey)}
  </p>;
}

function InventoryFields({ item, t }: { item?: WorkshopInventoryItem; t: Translate }) {
  return <div className="inventory-form-fields">
    <label className="inventory-field-wide">{t("inventory.itemName")}<input name="itemName" defaultValue={item?.itemName} minLength={2} maxLength={160} required /></label>
    <label>{t("inventory.sku")}<input name="sku" defaultValue={item?.sku} maxLength={80} required /></label>
    <label>{t("inventory.oemCode")}<input name="oemCode" defaultValue={item?.oemCode ?? ""} maxLength={100} /></label>
    <label>{t("inventory.type")}<select name="itemType" defaultValue={item?.itemType ?? "part"}><option value="part">{t("inventory.type.part")}</option><option value="consumable">{t("inventory.type.consumable")}</option></select></label>
    <label>{t("inventory.quantity")}<input name="quantity" type="number" min={0} max={100000000} step="0.01" defaultValue={item?.quantity ?? 0} required /></label>
    <label>{t("inventory.minimumQuantity")}<input name="minimumQuantity" type="number" min={0} max={100000000} step="0.01" defaultValue={item?.minimumQuantity ?? 0} required /></label>
    <label>{t("inventory.unit")}<select name="unit" defaultValue={item?.unit ?? "piece"}>{units.map((unit) => <option value={unit} key={unit}>{t(`inventory.unit.${unit}` as TranslationKey)}</option>)}</select></label>
    <label>{t("inventory.manufacturer")}<input name="manufacturer" defaultValue={item?.manufacturer ?? ""} maxLength={120} /></label>
    <label className="inventory-field-wide">{t("inventory.vehicleApplication")}<input name="vehicleApplication" defaultValue={item?.vehicleApplication ?? ""} maxLength={240} placeholder={t("inventory.vehicleApplicationPlaceholder")} /></label>
    <label>{t("inventory.storageLocation")}<input name="storageLocation" defaultValue={item?.storageLocation ?? ""} maxLength={120} placeholder={t("inventory.storageLocationPlaceholder")} /></label>
    <label className="inventory-field-wide">{t("inventory.notes")}<textarea name="notes" defaultValue={item?.notes ?? ""} rows={3} maxLength={1000} /></label>
  </div>;
}

function InventoryEditor({
  workshopId,
  item,
  t,
  onClose,
}: {
  workshopId: string;
  item: WorkshopInventoryItem | null;
  t: Translate;
  onClose: () => void;
}) {
  const action = item ? updateInventoryItemAction : createInventoryItemAction;
  const [state, formAction, pending] = useActionState(action, idle);
  return <div className="inventory-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="inventory-editor" role="dialog" aria-modal="true" aria-labelledby="inventory-editor-title">
      <header><div><p>{t(item ? "inventory.editEyebrow" : "inventory.addEyebrow")}</p><h2 id="inventory-editor-title">{t(item ? "inventory.editTitle" : "inventory.addTitle")}</h2></div><button type="button" onClick={onClose} aria-label={t("inventory.close")}>×</button></header>
      <form action={formAction}>
        {item ? <input type="hidden" name="inventoryId" value={item.id} /> : <input type="hidden" name="workshopId" value={workshopId} />}
        <fieldset disabled={pending}><InventoryFields item={item ?? undefined} t={t} /></fieldset>
        <Result state={state} t={t} />
        <footer><button type="button" className="inventory-secondary-action" onClick={onClose}>{t("inventory.cancel")}</button><button disabled={pending}>{t(pending ? "inventory.saving" : item ? "inventory.save" : "inventory.add")}</button></footer>
      </form>
    </section>
  </div>;
}

export default function WorkshopInventoryClient({
  inventories,
  logoutAction,
  portalBasePath,
}: {
  inventories: WorkshopInventory[];
  logoutAction: () => Promise<void>;
  portalBasePath: "/workshop-manager" | "/service-organisation";
}) {
  const [language, setLanguage, ready] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  const [workshopId, setWorkshopId] = useState(inventories[0]?.workshopId ?? "");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "part" | "consumable">("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [editing, setEditing] = useState<"new" | WorkshopInventoryItem | null>(null);
  const inventory = inventories.find((entry) => entry.workshopId === workshopId) ?? inventories[0];
  const items = inventory?.items ?? noItems;
  const visibleItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(language);
    return items.filter((item) => {
      const haystack = [item.itemName, item.sku, item.oemCode, item.manufacturer, item.vehicleApplication, item.storageLocation].filter(Boolean).join(" ").toLocaleLowerCase(language);
      return (!needle || haystack.includes(needle))
        && (typeFilter === "all" || item.itemType === typeFilter)
        && (stockFilter === "all" || stockState(item) === stockFilter);
    });
  }, [items, language, query, stockFilter, typeFilter]);
  const lowCount = items.filter((item) => stockState(item) === "low").length;
  const outCount = items.filter((item) => stockState(item) === "out").length;

  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  return <main className="settings-shell inventory-shell">
    <header className="settings-topbar"><Link href={portalBasePath}>← {t("workspace.back")}</Link><strong>pitster</strong><select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("a11y.languageSelector")}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select><form action={logoutAction}><button>{t("auth.logout")}</button></form></header>
    <section className="settings-content inventory-content">
      <header className="inventory-title"><div><p className="registration-kicker">{t("inventory.eyebrow")}</p><h1>{t("inventory.title")}</h1><span>{t("inventory.description")}</span></div>{inventory && <button type="button" onClick={() => setEditing("new")}>+ {t("inventory.add")}</button>}</header>

      {inventory ? <>
        <div className="inventory-overview">
          <article><span>{t("inventory.totalItems")}</span><strong>{items.length}</strong></article>
          <article className={lowCount ? "attention" : ""}><span>{t("inventory.lowStock")}</span><strong>{lowCount}</strong></article>
          <article className={outCount ? "danger" : ""}><span>{t("inventory.outOfStock")}</span><strong>{outCount}</strong></article>
        </div>

        <div className="inventory-filters">
          <label className="inventory-search">{t("inventory.search")}<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("inventory.searchPlaceholder")} /></label>
          {inventories.length > 1 && <label>{t("inventory.workshop")}<select value={inventory.workshopId} onChange={(event) => { setWorkshopId(event.target.value); setEditing(null); }}>
            {inventories.map((entry) => <option value={entry.workshopId} key={entry.workshopId}>{entry.workshopName} · {entry.serviceProviderName}</option>)}
          </select></label>}
          <label>{t("inventory.type")}<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}><option value="all">{t("inventory.filter.allTypes")}</option><option value="part">{t("inventory.type.part")}</option><option value="consumable">{t("inventory.type.consumable")}</option></select></label>
          <label>{t("inventory.stock")}<select value={stockFilter} onChange={(event) => setStockFilter(event.target.value as StockFilter)}><option value="all">{t("inventory.filter.allStock")}</option><option value="available">{t("inventory.stock.available")}</option><option value="low">{t("inventory.stock.low")}</option><option value="out">{t("inventory.stock.out")}</option></select></label>
        </div>

        <section className="inventory-table-card" aria-labelledby="inventory-workshop-title">
          <header><div><p>{inventory.serviceProviderName}</p><h2 id="inventory-workshop-title">{inventory.workshopName}</h2></div><span>{visibleItems.length} {t("inventory.visibleItems")}</span></header>
          <div className="inventory-table-wrap"><table>
            <thead><tr><th>{t("inventory.itemName")}</th><th>{t("inventory.sku")}</th><th>{t("inventory.oemCode")}</th><th>{t("inventory.type")}</th><th>{t("inventory.quantity")}</th><th>{t("inventory.manufacturer")}</th><th>{t("inventory.vehicleApplication")}</th><th>{t("inventory.stock")}</th><th aria-label={t("inventory.actions")} /></tr></thead>
            <tbody>{visibleItems.map((item) => {
              const state = stockState(item);
              return <tr key={item.id} className={`inventory-stock-${state}`}><td><strong>{item.itemName}</strong>{item.storageLocation && <small>{item.storageLocation}</small>}</td><td><code>{item.sku}</code></td><td>{item.oemCode ?? "—"}</td><td>{t(`inventory.type.${item.itemType}` as TranslationKey)}</td><td><b>{quantityText(language, item.quantity, item.unit, t)}</b>{item.minimumQuantity > 0 && <small>{t("inventory.minimumShort")} {quantityText(language, item.minimumQuantity, item.unit, t)}</small>}</td><td>{item.manufacturer ?? "—"}</td><td>{item.vehicleApplication ?? t("inventory.allVehicles")}</td><td><span className={`inventory-stock-badge ${state}`}>{t(`inventory.stock.${state}` as TranslationKey)}</span></td><td><button type="button" onClick={() => setEditing(item)}>{t("inventory.edit")}</button></td></tr>;
            })}</tbody>
          </table></div>
          {!visibleItems.length && <div className="inventory-empty"><h3>{items.length ? t("inventory.noMatchesTitle") : t("inventory.emptyTitle")}</h3><p>{items.length ? t("inventory.noMatchesDescription") : t("inventory.emptyDescription")}</p>{!items.length && <button type="button" onClick={() => setEditing("new")}>+ {t("inventory.addFirst")}</button>}</div>}
        </section>
      </> : <div className="catalogue-empty"><h2>{t("inventory.noWorkshopTitle")}</h2><p>{t("inventory.noWorkshopDescription")}</p><Link className="organization-action" href={portalBasePath === "/service-organisation" ? "/service-organisation/locations" : "/workshop-manager/workshops"}>{t("inventory.manageWorkshops")}</Link></div>}
    </section>
    {inventory && editing && <InventoryEditor workshopId={inventory.workshopId} item={editing === "new" ? null : editing} t={t} onClose={() => setEditing(null)} />}
  </main>;
}
