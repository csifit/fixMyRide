import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/authz.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const authz = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("doctor route states deny unauthenticated, pending, and suspended users", () => {
  assert.equal(authz.classifyDoctorAccess({}), "unauthenticated");
  assert.equal(authz.classifyDoctorAccess({
    authenticatedUserId: "user-1",
    clinicianAuthUserId: "user-1",
    verificationStatus: "pending",
  }), "pending");
  assert.equal(authz.classifyDoctorAccess({
    authenticatedUserId: "user-1",
    clinicianAuthUserId: "user-1",
    verificationStatus: "suspended",
  }), "suspended");
});

test("only the linked approved clinician is authorized", () => {
  assert.equal(authz.classifyDoctorAccess({
    authenticatedUserId: "user-1",
    clinicianAuthUserId: "user-1",
    verificationStatus: "approved",
  }), "approved");
  assert.equal(authz.classifyDoctorAccess({
    authenticatedUserId: "user-1",
    clinicianAuthUserId: "user-2",
    verificationStatus: "approved",
  }), "unauthorized");
});

test("active grants enforce expiry, revocation, and view versus edit permission", () => {
  const now = new Date("2026-07-29T12:00:00Z");
  const activeView = {
    status: "active", canView: true, canEdit: false,
    expiresAt: "2026-08-01T00:00:00Z", revokedAt: null,
  };
  assert.equal(authz.grantAllows(activeView, "view", now), true);
  assert.equal(authz.grantAllows(activeView, "edit", now), false);
  assert.equal(authz.grantAllows({ ...activeView, canEdit: true }, "edit", now), true);
  assert.equal(authz.grantAllows({ ...activeView, expiresAt: "2026-07-01T00:00:00Z" }, "view", now), false);
  assert.equal(authz.grantAllows({ ...activeView, status: "revoked", revokedAt: "2026-07-20T00:00:00Z" }, "view", now), false);
});
