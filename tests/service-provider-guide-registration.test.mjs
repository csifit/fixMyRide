import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const guide = await readFile(new URL("../app/guides/service-providers/page.tsx", import.meta.url), "utf8");
const platformGuide = await readFile(new URL("../app/guides/PlatformGuide.tsx", import.meta.url), "utf8");

test("service-provider guide directs organisation registration to the public account route", () => {
  assert.match(guide, /Register a Service organisation account/);
  assert.match(guide, /href: "\/register\/workshop-manager"/);
  assert.match(guide, /label: "here"/);
  assert.doesNotMatch(guide, /Accept the admin invitation/);
  assert.doesNotMatch(guide, /latest invitation sent by the platform administrator/);
  assert.match(platformGuide, /step\.link/);
  assert.match(platformGuide, /<Link href=\{step\.link\.href\}>/);
});
