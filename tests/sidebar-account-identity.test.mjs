import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const shell = await read("app/RoleWorkspaceShell.tsx");
const identity = await read("lib/dal/sidebar-identity.ts");
const admin = await read("app/admin/AdminDashboardClient.tsx");
const layouts = await Promise.all([
  "customer", "workshop-manager", "workshop-staff", "service-provider", "service-organisation",
].map((route) => read(`app/${route}/layout.tsx`)));

test("every role workspace passes verified account identity to the sidebar", () => {
  assert.match(identity, /supabase\.auth\.getClaims\(\)/);
  assert.match(identity, /claims\.email/);
  assert.match(identity, /metadata\.full_name/);
  for (const layout of layouts) {
    assert.match(layout, /getSidebarIdentity/);
    assert.match(layout, /identity=\{identity\}/);
  }
});

test("shared and admin sidebars show role, username, and email", () => {
  assert.match(shell, /<small>\{t\(nav\.titleKey\)\}<\/small>/);
  assert.match(shell, /useLanguage\(\)/);
  assert.match(shell, /<span>\{t\(item\.key\)\}<\/span>/);
  assert.match(shell, /identity\.displayName/);
  assert.match(shell, /identity\.email/);
  assert.match(admin, /data\.administrator\.role/);
  assert.match(admin, /data\.administrator\.displayName/);
  assert.match(admin, /data\.administrator\.email/);
});
