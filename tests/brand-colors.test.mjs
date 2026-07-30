import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const css = await readFile(new URL("app/globals.css", root), "utf8");
const emails = await Promise.all([
  "lib/email/invitation.ts",
  "lib/email/appointment.ts",
  "lib/email/appointment-request.ts",
].map((file) => readFile(new URL(file, root), "utf8")));

test("VitaPass uses the approved teal as its primary brand colour", () => {
  assert.match(css, /--green:#006E6E/i);
  assert.ok((css.match(/#006E6E/gi) ?? []).length >= 25);
  assert.doesNotMatch(css, /#087b69|#176f63|#176f60|#0d7564|#137663/i);
});

test("transactional email branding uses the same approved teal", () => {
  for (const email of emails) {
    assert.match(email, /#006E6E/i);
    assert.doesNotMatch(email, /#176f63|#176f60|#0d7564/i);
  }
});
