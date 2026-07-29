"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Language } from ".";
import { languageStorageKey, languageStore } from "./language-store";

export function useLanguage() {
  const state = useSyncExternalStore(
    languageStore.subscribe,
    languageStore.getSnapshot,
    languageStore.getServerSnapshot,
  );

  useEffect(() => {
    languageStore.restore(window.localStorage);
    const restoreFromStorage = (event: StorageEvent) => {
      if (event.key === languageStorageKey) {
        languageStore.restore(window.localStorage);
      }
    };
    window.addEventListener("storage", restoreFromStorage);
    return () => window.removeEventListener("storage", restoreFromStorage);
  }, []);

  useEffect(() => {
    if (state.ready) document.documentElement.lang = state.language;
  }, [state]);

  const setLanguage = (language: Language) => {
    languageStore.select(language, window.localStorage);
    document.documentElement.lang = language;
  };

  return [state.language, setLanguage, state.ready] as const;
}
