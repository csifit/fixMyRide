import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const css = await readFile(new URL("app/globals.css", root), "utf8");
const brandSource = await readFile(new URL("lib/brand.ts", root), "utf8");
const layoutSource = await readFile(new URL("app/layout.tsx", root), "utf8");
const stripeGuide = await readFile(new URL("docs/stripe-billing.md", root), "utf8");

test("pitster uses the approved teal as its primary brand colour", () => {
  assert.match(css, /--green:#006E6E/i);
  assert.ok((css.match(/#006E6E/gi) ?? []).length >= 25);
  assert.doesNotMatch(css, /#087b69|#176f63|#176f60|#0d7564|#137663/i);
});

test("pitster is the default product brand and production Stripe origin", () => {
  assert.match(brandSource, /BRAND_ID[^\n]+\|\| "pitster"/);
  assert.match(brandSource, /BRAND_NAME[^\n]+\|\| "pitster"/);
  assert.match(brandSource, /support@pitster\.app/);
  assert.match(layoutSource, /https:\/\/www\.pitster\.app/);
  assert.match(layoutSource, /Find and book trusted vehicle service/);
  assert.match(
    stripeGuide,
    /https:\/\/www\.pitster\.app\/api\/stripe\/webhook/,
  );
});
