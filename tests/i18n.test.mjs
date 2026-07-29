import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../app/i18n/", import.meta.url);
const languages = ["en", "de", "ro", "hu"];
const catalogs = Object.fromEntries(
  await Promise.all(languages.map(async (language) => [
    language,
    JSON.parse(await readFile(new URL(`${language}.json`, root), "utf8")),
  ])),
);

const placeholders = (value) =>
  [...value.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((match) => match[1]).sort();

test("every language has exactly the English translation keys", () => {
  const expected = Object.keys(catalogs.en).sort();
  for (const language of languages) {
    assert.deepEqual(Object.keys(catalogs[language]).sort(), expected, `${language} key set`);
  }
});

test("translations are non-empty and preserve message placeholders", () => {
  for (const [key, english] of Object.entries(catalogs.en)) {
    for (const language of languages) {
      const value = catalogs[language][key];
      assert.equal(typeof value, "string", `${language}.${key} must be a string`);
      assert.notEqual(value.trim(), "", `${language}.${key} must not be empty`);
      assert.deepEqual(placeholders(value), placeholders(english), `${language}.${key} placeholders`);
    }
  }
});
