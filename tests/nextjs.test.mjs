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
  assert.equal(typeof manifest["/doctor/page"], "string");
  assert.equal(typeof manifest["/admin/page"], "string");
  assert.equal(typeof manifest["/admin/login/page"], "string");
  assert.equal(typeof manifest["/admin/mfa/enroll/page"], "string");
  assert.equal(typeof manifest["/admin/mfa/challenge/page"], "string");
});

test("patient and doctor pages use local prototype data", async () => {
  const patientPage = await readFile(new URL("app/patient/page.tsx", root), "utf8");
  const doctorPage = await readFile(new URL("app/doctor/page.tsx", root), "utf8");
  assert.match(patientPage, /patientPortalData/);
  assert.match(patientPage, /PatientPortal/);
  assert.match(doctorPage, /getDoctorAccess/);
  assert.match(doctorPage, /loadDoctorDashboard/);
  assert.match(doctorPage, /DoctorPortal/);
});

test("doctor route redirects unauthenticated users and has no-store rendering", async () => {
  const doctorPage = await readFile(new URL("app/doctor/page.tsx", root), "utf8");
  assert.match(doctorPage, /state === "unauthenticated"\) redirect\("\/doctor\/login"\)/);
  assert.match(doctorPage, /dynamic = "force-dynamic"/);
  assert.match(doctorPage, /revalidate = 0/);
});

test("doctor login stores the Server Action cookies before full navigation", async () => {
  const action = await readFile(new URL("app/doctor/actions.ts", root), "utf8");
  const form = await readFile(new URL("app/doctor/login/LoginForm.tsx", root), "utf8");
  assert.match(action, /return \{ error: null, success: true \}/);
  assert.doesNotMatch(action, /record_auth_audit[\s\S]+?redirect\("\/doctor"\)/);
  assert.match(form, /if \(state\.success\) window\.location\.assign\("\/doctor"\)/);
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
