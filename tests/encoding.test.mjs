import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const roots = ["app", "tests"];
const singleFiles = [
  ".editorconfig",
  "package.json",
  "SECURITY.md",
  "tsconfig.json",
  "next.config.ts",
];
const decoder = new TextDecoder("utf-8", { fatal: true });
const mojibakeMarkers = [
  "\u00c3",
  "\u00c2",
  "\u00e2\u20ac",
  "\u00ef\u00bf\u00bd",
  "\ufffd",
];

test("project text is valid UTF-8 without common mojibake", async () => {
  const files = [
    ...singleFiles.map((file) => path.join(root, file)),
    ...(await Promise.all(roots.map((directory) => walk(path.join(root, directory))))).flat(),
  ];

  for (const file of files) {
    const bytes = await readFile(file);
    const text = decoder.decode(bytes);
    for (const marker of mojibakeMarkers) {
      assert.equal(
        text.includes(marker),
        false,
        `${path.relative(root, file)} contains a mojibake marker`,
      );
    }
  }
});

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(entryPath)));
    else if (/\.(?:css|json|md|mjs|sql|ts|tsx)$/.test(entry.name)) files.push(entryPath);
  }
  return files;
}
