import de from "./de.json";
import en from "./en.json";
import hu from "./hu.json";
import ro from "./ro.json";
import { brand } from "@/lib/brand";

export const languages = ["en", "de", "ro", "hu"] as const;
export type Language = (typeof languages)[number];
export type TranslationKey = keyof typeof en;
export type TranslationParams = Record<string, string | number>;

const checkedDe: Record<TranslationKey, string> = de;
const checkedRo: Record<TranslationKey, string> = ro;
const checkedHu: Record<TranslationKey, string> = hu;

const dictionaries: Record<Language, Record<TranslationKey, string>> = {
  en,
  de: checkedDe,
  ro: checkedRo,
  hu: checkedHu,
};

export const locales: Record<Language, string> = {
  en: "en-GB",
  de: "de-DE",
  ro: "ro-RO",
  hu: "hu-HU",
};

export function translate(
  language: Language,
  key: TranslationKey,
  params: TranslationParams = {},
) {
  return Object.entries(params).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    dictionaries[language][key],
  );
}

export function formatDate(
  language: Language,
  value: string,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: brand.timeZone,
  },
) {
  return new Intl.DateTimeFormat(locales[language], {
    timeZone: brand.timeZone,
    ...options,
  }).format(new Date(value));
}

export function formatDateTime(language: Language, value: string) {
  return new Intl.DateTimeFormat(locales[language], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: brand.timeZone,
  }).format(new Date(value));
}

export function formatRelativeTime(
  language: Language,
  value: string,
  reference: string,
) {
  const minutes = Math.round(
    (new Date(value).getTime() - new Date(reference).getTime()) / 60_000,
  );
  if (Math.abs(minutes) < 60) {
    return new Intl.RelativeTimeFormat(locales[language], { numeric: "auto" }).format(
      minutes,
      "minute",
    );
  }
  const hours = Math.round(minutes / 60);
  return new Intl.RelativeTimeFormat(locales[language], { numeric: "auto" }).format(
    hours,
    "hour",
  );
}

export const medicalKey = {
  sex: (key: "female" | "male") => `medical.sex.${key}` as TranslationKey,
  relationship: (key: "husband") =>
    `medical.relationship.${key}` as TranslationKey,
  allergy: (key: "penicillin" | "latex" | "ibuprofen" | "noneKnown") =>
    `medical.allergy.${key}` as TranslationKey,
  condition: (
    key:
      | "type2Diabetes"
      | "hypertension"
      | "atrialFibrillation"
      | "asthma"
      | "hyperlipidemia"
      | "hypothyroidism",
  ) => `medical.condition.${key}` as TranslationKey,
  schedule: (key: "twiceDaily" | "everyMorning" | "asPrescribed") =>
    `medical.schedule.${key}` as TranslationKey,
  procedure: (key: "appendectomy") =>
    `medical.procedure.${key}` as TranslationKey,
  implant: (key: "none") => `medical.implant.${key}` as TranslationKey,
};
