import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608110048_public_workshop_slug_urls.sql");
const dal = await read("lib/dal/public-workshops.ts");
const home = await read("app/HomeDiscoveryClient.tsx");
const map = await read("app/PublicWorkshopMap.tsx");
const detail = await read("app/workshops/[workshopId]/page.tsx");
const request = await read("app/workshops/[workshopId]/request/page.tsx");
const css = await read("app/globals.css");

test("main-page locale changes drive translated visible copy", () => {
  assert.match(home, /translate\(language, key\)/);
  assert.match(home, /onChange=\{\(event\) => setLanguage/);
  assert.match(home, /home\.hero\.title/);
  assert.match(home, /home\.search\.title/);
  assert.match(home, /home\.footer\.customers/);
});

test("main and public locale switchers use compact language-code text", () => {
  assert.match(css, /\.home-header select \{[^}]*font-size:9px/);
  assert.match(css, /\.booking-header select \{[^}]*font-size:9px/);
});

test("public discovery exposes and uses canonical workshop slugs", () => {
  assert.match(migration, /create function public\.search_public_workshops_v2/);
  assert.match(migration, /workshop_id uuid, workshop_slug text/);
  assert.match(migration, /select workshop\.id, workshop\.slug/);
  assert.match(dal, /search_public_workshops_v2/);
  assert.match(dal, /workshop\.slug === workshopReference/);
  assert.match(home, /workshops\/\$\{workshop\.slug\}/);
  assert.match(map, /workshops\/\$\{selected\.slug\}/);
});

test("legacy UUID detail and request URLs redirect to the slug canonical", () => {
  assert.match(detail, /workshopId !== workshop\.slug/);
  assert.match(detail, /redirect\(`\/workshops\/\$\{workshop\.slug\}/);
  assert.match(request, /workshopId !== workshop\.slug/);
  assert.match(request, /redirect\(`\/workshops\/\$\{workshop\.slug\}\/request/);
  assert.match(detail, /loadPublicWorkshopServices\(workshop\.id\)/);
  assert.match(request, /loadPublicWorkshopBookingRules\(workshop\.id\)/);
  assert.match(detail, /alternates: \{ canonical: `\/workshops\/\$\{workshop\.slug\}` \}/);
});
