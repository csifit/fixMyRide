import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const migration = await read("supabase/migrations/202608190068_deterministic_role_guidance.sql");
const shell = await read("app/RoleWorkspaceShell.tsx");
const component = await read("app/guidance/RoleGuidance.tsx");
const tooltip = await read("app/guidance/GuidanceTooltip.tsx");
const content = await read("app/guidance/content.ts");
const styles = await read("app/globals.css");

test("provider workspaces receive route-specific deterministic guidance", () => {
  assert.match(shell, /<RoleGuidance/);
  for (const route of [
    "/workshop-manager/requests", "/workshop-manager/services", "/workshop-manager/inventory",
    "/service-organisation/locations", "/service-organisation/managers", "/service-organisation/billing",
  ]) assert.match(content, new RegExp(route.replaceAll("/", "\\/")));
  for (const language of ["en", "de", "ro", "hu"]) assert.match(content, new RegExp(`\\b${language}: \\{`));
  assert.doesNotMatch(content, /\b(?:SMS|WhatsApp)\b/i);
});

test("guidance is accessible, dismissible and always reopenable", () => {
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /event\.key === "Escape"/);
  assert.match(component, /className="role-guidance-launcher"/);
  assert.match(component, /dismissGuidanceAction/);
  assert.match(tooltip, /<details className="guidance-tooltip">/);
  assert.match(tooltip, /role="tooltip"/);
});

test("dismissal preferences are private and RPC-only", () => {
  assert.match(migration, /create table public\.user_guidance_preferences/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.user_guidance_preferences from public, anon, authenticated/);
  assert.match(migration, /preference\.auth_user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /on conflict \(auth_user_id, role, guide_key\) do update/);
  assert.match(migration, /grant execute on function public\.dismiss_my_guidance[\s\S]+to authenticated/);
});

test("guidance follows the readable platform typography", () => {
  const guidanceCss = styles.slice(styles.indexOf("/* Deterministic role guidance */"));
  const sizes = [...guidanceCss.matchAll(/font-size:\s*([0-9.]+)px/g)].map((match) => Number(match[1]));
  assert.equal(sizes.some((size) => size < 10), false);
  assert.doesNotMatch(guidanceCss, /font(?:-weight|):\s*(?:[5-9][0-9]{2}|bold|bolder)/);
});
