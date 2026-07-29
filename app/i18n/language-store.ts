import { languages, type Language } from ".";

export const languageStorageKey = "vitapass.language";

export type LanguageState = {
  language: Language;
  ready: boolean;
};

type LanguageStorage = Pick<Storage, "getItem" | "setItem">;

const initialState: LanguageState = { language: "en", ready: false };

function savedLanguage(storage: Pick<LanguageStorage, "getItem">): Language {
  const stored = storage.getItem(languageStorageKey);
  return languages.includes(stored as Language) ? (stored as Language) : "en";
}

export function createLanguageStore() {
  let state = initialState;
  const listeners = new Set<() => void>();

  const publish = (next: LanguageState) => {
    if (state.language === next.language && state.ready === next.ready) return;
    state = next;
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot: () => state,
    getServerSnapshot: () => initialState,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    restore: (storage: Pick<LanguageStorage, "getItem">) => {
      publish({ language: savedLanguage(storage), ready: true });
    },
    select: (language: Language, storage: LanguageStorage) => {
      storage.setItem(languageStorageKey, language);
      publish({ language, ready: true });
    },
  };
}

export const languageStore = createLanguageStore();
