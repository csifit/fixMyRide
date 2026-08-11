import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const sitemap = await read("app/sitemap.ts");
const robots = await read("app/robots.ts");

test("the XML sitemap uses the canonical Pitster host and public workshop slugs", () => {
  assert.match(sitemap, /https:\/\/www\.pitster\.app/);
  assert.match(sitemap, /rpc\("search_public_workshops_v2"/);
  assert.match(sitemap, /persistSession: false/);
  assert.match(sitemap, /row\.workshop_slug/);
  assert.match(sitemap, /\/workshops\/\$\{encodeURIComponent\(slug\)\}/);
  assert.doesNotMatch(sitemap, /\/admin|\/customer|\/garage|\/request/);
});

test("robots advertises the sitemap and excludes private or transactional routes", () => {
  assert.match(robots, /sitemap: `\$\{canonicalOrigin\}\/sitemap\.xml`/);
  for (const route of [
    "/admin", "/api", "/auth", "/customer", "/garage", "/register",
    "/service-provider", "/workshop-manager", "/workshop-staff",
    "/workshops/*/request",
  ]) {
    assert.match(robots, new RegExp(route.replaceAll("*", "\\*")));
  }
});
