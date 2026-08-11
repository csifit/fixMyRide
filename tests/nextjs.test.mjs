import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("standard Next.js production output exists", async () => {
  await access(new URL(".next/BUILD_ID", root));
  const manifest = JSON.parse(
    await readFile(new URL(".next/server/app-paths-manifest.json", root), "utf8"),
  );
  assert.equal(typeof manifest["/page"], "string");
  assert.equal(typeof manifest["/customer/bookings/page"], "string");
  assert.equal(typeof manifest["/workshop-manager/page"], "string");
  assert.equal(typeof manifest["/service-organisation/page"], "string");
  assert.equal(typeof manifest["/admin/page"], "string");
  assert.equal(typeof manifest["/admin/login/page"], "string");
  assert.equal(typeof manifest["/admin/mfa/enroll/page"], "string");
  assert.equal(typeof manifest["/admin/mfa/challenge/page"], "string");
});

test("customer and workshop-manager pages use canonical platform access", async () => {
  const customerPage = await readFile(new URL("app/customer/bookings/page.tsx", root), "utf8");
  const managerPage = await readFile(new URL("app/workshop-manager/page.tsx", root), "utf8");
  assert.match(customerPage, /getCustomerAccess/);
  assert.match(customerPage, /loadMyServiceBookings/);
  assert.match(managerPage, /getWorkshopManagerAccess/);
  assert.match(managerPage, /loadManagedServiceProviders/);
});

test("canonical account routes redirect unauthenticated users", async () => {
  const customerPage = await readFile(new URL("app/customer/bookings/page.tsx", root), "utf8");
  const managerPage = await readFile(new URL("app/workshop-manager/page.tsx", root), "utf8");
  assert.match(customerPage, /state === "unauthenticated"\) redirect\("\/customer\/login"\)/);
  assert.match(managerPage, /state === "unauthenticated"\) redirect\("\/workshop-manager\/login"\)/);
  assert.match(customerPage, /dynamic = "force-dynamic"/);
  assert.match(managerPage, /dynamic = "force-dynamic"/);
});

test("platform login redirects to canonical destinations", async () => {
  const action = await readFile(new URL("app/authentication/actions.ts", root), "utf8");
  const form = await readFile(new URL("app/authentication/PlatformLoginForm.tsx", root), "utf8");
  assert.match(action, /"\/customer\/bookings"/);
  assert.match(action, /"\/workshop-manager"/);
  assert.match(action, /"\/service-organisation"/);
  assert.match(form, /platformLoginAction/);
});

test("admin route is protected, dynamic, and redirects aal1 superadmins to MFA", async () => {
  const adminPage = await readFile(new URL("app/admin/page.tsx", root), "utf8");
  const proxy = await readFile(new URL("proxy.ts", root), "utf8");
  assert.match(adminPage, /getAdminAccess/);
  assert.match(adminPage, /state === "unauthenticated"\) redirect\("\/admin\/login"\)/);
  assert.match(adminPage, /state === "mfa_required"/);
  assert.match(adminPage, /getAdminMfaDestination/);
  assert.match(adminPage, /dynamic = "force-dynamic"/);
  assert.match(adminPage, /revalidate = 0/);
  assert.match(proxy, /"\/admin\/:path\*"/);
});

test("package uses only the standard Next.js runtime", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("package.json", root), "utf8"),
  );
  assert.equal(packageJson.scripts.dev, "next dev");
  assert.equal(packageJson.scripts.build, "next build");
  assert.equal(packageJson.scripts.start, "next start");

  const serialized = JSON.stringify({
    dependencies: packageJson.dependencies,
    devDependencies: packageJson.devDependencies,
  });
  for (const integration of [
    "vinext",
    "vite",
    "wrangler",
    "drizzle",
    "@cloudflare",
  ]) {
    assert.equal(serialized.includes(integration), false, integration);
  }
});
