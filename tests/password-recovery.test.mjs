import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("every login form offers role-aware password recovery", async () => {
  const [platformLogin, adminLogin] = await Promise.all([
    read("app/authentication/PlatformLoginForm.tsx"),
    read("app/admin/login/AdminLoginForm.tsx"),
  ]);
  assert.match(platformLogin, /\/forgot-password\?portal=\$\{portal\}/);
  assert.match(platformLogin, /passwordRecovery\.forgotLink/);
  assert.match(adminLogin, /\/forgot-password\?portal=admin/);
});

test("reset requests are email-enumeration safe and retain the login portal", async () => {
  const action = await read("app/forgot-password/actions.ts");
  assert.match(action, /resetPasswordForEmail/);
  assert.match(action, /callback\.searchParams\.set\("flow", "recovery"\)/);
  assert.match(action, /callback\.searchParams\.set\("portal", input\.data\.portal\)/);
  assert.match(action, /return \{ status: "sent" \}/);
  assert.doesNotMatch(action, /user.*not.*found|email.*exists/i);
});

test("the auth callback accepts recovery OTP and PKCE code flows", async () => {
  const callback = await read("app/auth/confirm/route.ts");
  assert.match(callback, /type === "recovery"/);
  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.match(callback, /destination\.pathname = recovery \? "\/reset-password"/);
  assert.match(callback, /destination\.searchParams\.set\("portal", portal\)/);
});

test("password reset requires a verified session and revokes other sessions", async () => {
  const [page, action, client, proxy] = await Promise.all([
    read("app/reset-password/page.tsx"),
    read("app/reset-password/actions.ts"),
    read("app/reset-password/ResetPasswordClient.tsx"),
    read("proxy.ts"),
  ]);
  assert.match(page, /auth\.getClaims\(\)/);
  assert.match(action, /auth\.updateUser\(\{/);
  assert.match(action, /password: input\.data\.password/);
  assert.match(action, /auth\.signOut\(\{ scope: "global" \}\)/);
  assert.match(client, /minLength=\{8\}/);
  assert.match(client, /autoComplete="new-password"/);
  assert.match(proxy, /"\/forgot-password"/);
  assert.match(proxy, /"\/reset-password"/);
});

test("password recovery is translated in every supported language", async () => {
  const languages = ["en", "de", "ro", "hu"];
  const catalogs = await Promise.all(languages.map(async (language) =>
    JSON.parse(await read(`app/i18n/${language}.json`))));
  const keys = Object.keys(catalogs[0]).filter((key) => key.startsWith("passwordRecovery."));
  assert.ok(keys.length >= 20);
  for (const catalog of catalogs) {
    assert.deepEqual(
      Object.keys(catalog).filter((key) => key.startsWith("passwordRecovery.")).sort(),
      [...keys].sort(),
    );
  }
});
