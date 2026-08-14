import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [home, layout, modal, legalClient, legalContent, sitemap, styles] = await Promise.all([
  read("app/HomeDiscoveryClient.tsx"),
  read("app/layout.tsx"),
  read("app/PrivacyNoticeModal.tsx"),
  read("app/legal/LegalDocumentClient.tsx"),
  read("app/legal/legal-content.ts"),
  read("app/sitemap.ts"),
  read("app/globals.css"),
]);

test("footer and sitemap expose dedicated legal documents", () => {
  for (const route of ["terms", "privacy", "cookies"]) {
    assert.match(home, new RegExp(`href="/${route}"`));
  }
  assert.match(sitemap, /\["terms", "privacy", "cookies"\]/);
  assert.match(legalClient, /legalDocuments\[language\]\[documentType\]/);
  assert.match(legalContent, /Record<Language/);
  assert.match(legalContent, /en:/);
  assert.match(legalContent, /de:/);
  assert.match(legalContent, /ro:/);
  assert.match(legalContent, /hu:/);
});

test("privacy acknowledgement is one-time and is not optional-tracking consent", () => {
  assert.match(layout, /<PrivacyNoticeModal/);
  assert.match(modal, /pitster\.privacy-notice\.2026-08/);
  assert.match(modal, /localStorage\.setItem\(acknowledgementKey, "understood"\)/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(legalContent, /not consent to optional advertising or analytics/i);
  assert.match(legalContent, /Google Maps/);
  assert.match(styles, /\.privacy-notice-backdrop/);
});

test("privacy page directs account closure through the written ticket form", () => {
  assert.match(legalClient, /href="\/contact\?type=account-closure"/);
  assert.match(legalContent, /30 or 60 days/);
  assert.match(legalContent, /Invoices, payment evidence, security logs/);
});
