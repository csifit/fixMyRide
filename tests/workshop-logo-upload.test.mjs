import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const migration = await read("supabase/migrations/202608180067_workshop_logos.sql");
const actions = await read("app/workshop-manager/workshops/actions.ts");
const operations = await read("lib/dal/workshop-operations.ts");
const cards = await read("app/HomeDiscoveryClient.tsx");
const profile = await read("app/workshops/[workshopId]/page.tsx");
const nextConfig = await read("next.config.ts");

test("workshop logos use a constrained public Supabase bucket", () => {
  assert.match(migration, /'workshop-logos',[\s\S]+true,[\s\S]+2097152/);
  assert.match(migration, /array\['image\/jpeg', 'image\/png'\]/);
  assert.match(migration, /claim_status in \('not_applicable', 'claimed'\)/);
  assert.match(migration, /private\.can_manage_automotive_workshop\(workshop\.id\)/);
  assert.match(migration, /create or replace function public\.set_my_workshop_logo_path/);
});

test("logo upload validates size, MIME type, and extension on the server", () => {
  assert.match(actions, /file\.size <= 2 \* 1024 \* 1024/);
  assert.match(actions, /\["image\/jpeg", "image\/png"\]\.includes\(file\.type\)/);
  assert.match(actions, /\\\.\(jpe\?g\|png\)\$/);
  assert.match(actions, /header\[0\] === 255[\s\S]+header\[1\] === 216[\s\S]+header\[2\] === 255/);
  assert.match(actions, /\[137, 80, 78, 71, 13, 10, 26, 10\]/);
  assert.match(nextConfig, /bodySizeLimit: "2150kb"/);
  assert.match(operations, /\.from\("workshop-logos"\)[\s\S]+\.upload\(logoPath/);
});

test("public workshop cards and profile sidebar display stored logos", () => {
  assert.match(cards, /className="home-workshop-logo"/);
  assert.match(profile, /className="workshop-profile-logo"/);
  assert.match(profile, /workshop\.logoUrl/);
});
