"use client";

import { useEffect, useSyncExternalStore } from "react";
import { languages, type Language } from ".";

const storageKey = "vitapass.language";
const eventName = "vitapass-language-change";

function readLanguage(): Language {
  const stored = window.localStorage.getItem(storageKey);
  return languages.includes(stored as Language) ? (stored as Language) : "en";
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(eventName, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(eventName, onChange);
  };
}

export function useLanguage() {
  const language = useSyncExternalStore(subscribe, readLanguage, () => "en" as Language);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const setLanguage = (next: Language) => {
    window.localStorage.setItem(storageKey, next);
    document.documentElement.lang = next;
    window.dispatchEvent(new Event(eventName));
  };
  return [language, setLanguage] as const;
}
