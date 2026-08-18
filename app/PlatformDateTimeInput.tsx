"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { locales, translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";

type PickerMode = "date" | "time" | "datetime-local";

type PlatformDateTimeInputProps = {
  mode: PickerMode;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
  step?: number;
  required?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
};

function dateValue(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function parsedDate(value: string) {
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function addDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

export default function PlatformDateTimeInput({
  mode, name, value, defaultValue = "", onChange, min, max, step,
  required, disabled, ariaLabel,
}: PlatformDateTimeInputProps) {
  const [language] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const currentValue = value ?? internalValue;
  const selectedDate = parsedDate(currentValue);
  const initialCursor = selectedDate ?? parsedDate(min ?? "") ?? new Date();
  const [cursor, setCursor] = useState(() => new Date(initialCursor.getFullYear(), initialCursor.getMonth(), 1));
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  const update = (next: string) => {
    if (value === undefined) setInternalValue(next);
    onChange?.(next);
  };

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const minuteStep = Math.max(1, Math.floor((step ?? 300) / 60));
  const minutes = useMemo(() => Array.from({ length: Math.ceil(60 / minuteStep) }, (_, index) => index * minuteStep).filter((minute) => minute < 60), [minuteStep]);
  const time = mode === "date" ? "" : currentValue.includes("T") ? currentValue.split("T")[1]?.slice(0, 5) ?? "" : currentValue.slice(0, 5);
  const [hour = "", minute = ""] = time.split(":");
  const setTime = (nextHour: string, nextMinute: string) => {
    const nextTime = nextHour && nextMinute ? `${nextHour}:${nextMinute}` : "";
    if (mode === "time") update(nextTime);
    else update(`${currentValue.slice(0, 10) || dateValue(new Date())}T${nextTime || "00:00"}`);
  };

  const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = addDays(firstDay, -((firstDay.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const weekdays = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locales[language], { weekday: "short" }).format(addDays(new Date(2024, 0, 1), index)));
  const chooseDate = (day: Date) => {
    const nextDate = dateValue(day);
    update(mode === "date" ? nextDate : `${nextDate}T${time || "09:00"}`);
    if (mode === "date") setOpen(false);
  };
  const isUnavailable = (day: Date) => {
    const key = dateValue(day);
    return Boolean((min && key < min.slice(0, 10)) || (max && key > max.slice(0, 10)));
  };
  const displayValue = selectedDate
    ? `${new Intl.DateTimeFormat(locales[language], { dateStyle: "medium" }).format(selectedDate)}${mode === "datetime-local" && time ? ` · ${time}` : ""}`
    : t(mode === "datetime-local" ? "calendarPicker.chooseDateTime" : "calendarPicker.chooseDate");

  const timeFields = <div className="platform-time-fields">
    <div className="platform-time-field"><span>{t("calendarPicker.hour")}</span><select value={hour} disabled={disabled} onChange={(event) => setTime(event.target.value, minute || "00")} aria-label={t("calendarPicker.hour")}><option value="">--</option>{Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0")).map((item) => <option key={item}>{item}</option>)}</select></div>
    <span aria-hidden="true">:</span>
    <div className="platform-time-field"><span>{t("calendarPicker.minute")}</span><select value={minute} disabled={disabled} onChange={(event) => setTime(hour || "00", event.target.value)} aria-label={t("calendarPicker.minute")}><option value="">--</option>{minutes.map((item) => { const text = String(item).padStart(2, "0"); return <option key={text}>{text}</option>; })}</select></div>
  </div>;

  if (mode === "time") return <div className="platform-date-time-input platform-time-only">
    {name && <input type="hidden" name={name} value={currentValue} />}
    {timeFields}
  </div>;

  return <div className="platform-date-time-input" ref={rootRef}>
    {name && <input type="hidden" name={name} value={currentValue} />}
    <button type="button" className="platform-date-trigger" disabled={disabled} aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} aria-controls={dialogId} data-required={required || undefined} onClick={() => setOpen((current) => !current)}>
      <span aria-hidden="true">▦</span><span>{displayValue}</span>
    </button>
    {open && <div className="platform-calendar-popover" role="dialog" aria-modal="false" id={dialogId} aria-label={ariaLabel ?? displayValue}>
      <header><button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label={t("calendar.previous")}>‹</button><strong>{new Intl.DateTimeFormat(locales[language], { month: "long", year: "numeric" }).format(cursor)}</strong><button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label={t("calendar.next")}>›</button></header>
      <div className="platform-calendar-weekdays" aria-hidden="true">{weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
      <div className="platform-calendar-days">{days.map((day) => { const key = dateValue(day); return <button type="button" key={key} disabled={isUnavailable(day)} className={`${day.getMonth() === cursor.getMonth() ? "" : "outside-month"}${key === currentValue.slice(0, 10) ? " selected" : ""}`} aria-pressed={key === currentValue.slice(0, 10)} onClick={() => chooseDate(day)}>{day.getDate()}</button>; })}</div>
      {mode === "datetime-local" && timeFields}
      <footer><button type="button" onClick={() => { const today = new Date(); setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); chooseDate(today); }}>{t("calendar.today")}</button><button type="button" onClick={() => setOpen(false)}>{t("common.close")}</button></footer>
    </div>}
  </div>;
}
