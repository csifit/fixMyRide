import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const scannedRoots = ["app", "lib", "supabase"];

test("the committed environment template contains only blank public values", async () => {
  const example = await readFile(path.join(root, ".env.example"), "utf8");
  assert.equal(
    example.replaceAll("\r\n", "\n"),
    "NEXT_PUBLIC_SUPABASE_URL=\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\n",
  );
});

test("source contains no Supabase service key or token-shaped secret", async () => {
  const files = (await Promise.all(scannedRoots.map((entry) => walk(path.join(root, entry))))).flat();
  files.push(path.join(root, "proxy.ts"), path.join(root, "README.md"), path.join(root, "SECURITY.md"));
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /SUPABASE_SERVICE_ROLE|sb_secret_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, path.relative(root, file));
  }
});

test("server authorization never calls getSession", async () => {
  for (const file of await walk(path.join(root, "lib"))) {
    const text = await readFile(file, "utf8");
    assert.equal(text.includes(".auth.getSession("), false, path.relative(root, file));
  }
});

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(entryPath));
    else if (/\.(?:json|md|mjs|sql|ts|tsx)$/.test(entry.name)) files.push(entryPath);
  }
  return files;
}
