import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sourceUrl = new URL("../app/i18n/language-store.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const formattingSource = await readFile(new URL("../app/i18n/index.ts", import.meta.url), "utf8");
const brandSource = await readFile(new URL("../lib/brand.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText
  .replace('import { languages } from ".";', 'const languages = ["en", "de", "ro", "hu"];')
  .replace("export const languageStore = createLanguageStore();", "");
const { createLanguageStore, languageStorageKey } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

for (const saved of ["ro", "de", "hu"]) {
  test(`saved ${saved} language is restored only after deterministic hydration`, () => {
    const values = new Map([[languageStorageKey, saved]]);
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
    const store = createLanguageStore();

    assert.deepEqual(store.getServerSnapshot(), { language: "en", ready: false });
    assert.strictEqual(
      store.getSnapshot(),
      store.getServerSnapshot(),
      "the server and first client snapshot must be the same object",
    );

    store.restore(storage);
    assert.deepEqual(store.getSnapshot(), { language: saved, ready: true });

    const routeSnapshot = store.getSnapshot();
    assert.equal(routeSnapshot.language, saved, "a client route change keeps the language");
    assert.equal(storage.getItem(languageStorageKey), saved);
  });
}

test("date text uses one brand timezone during server and browser hydration", () => {
  assert.match(brandSource, /NEXT_PUBLIC_BRAND_TIME_ZONE/);
  assert.match(brandSource, /Europe\/Bucharest/);
  assert.match(formattingSource, /timeZone: brand\.timeZone/);
  assert.doesNotMatch(formattingSource, /Intl\.DateTimeFormat\(locales\[language\], options\)/);
});
