import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const email = await read("lib/email/invitation-emails.ts");
const adminActions = await read("app/admin/workflow-actions.ts");
const ownerActions = await read("app/workshop-manager/organisation/actions.ts");
const ownerInvitationDelivery = await read("lib/location-manager-invitations.ts");
const adminForms = await read("app/admin/AdminWorkflowForms.tsx");
const ownerClient = await read("app/workshop-manager/organisation/OrganisationCoverageClient.tsx");

test("invitation email delivery uses the MXroute API with an authenticated SMTPS fallback", () => {
  assert.match(email, /^import "server-only";/);
  assert.match(email, /https:\/\/smtpapi\.mxroute\.com\//);
  for (const setting of ["MXROUTE_SERVER", "MXROUTE_USERNAME", "MXROUTE_PASSWORD"]) {
    assert.match(email, new RegExp(setting));
  }
  assert.match(email, /payload\?\.success === true/);
  assert.match(email, /classifyMxrouteFailure/);
  assert.match(email, /authentication_failed/);
  assert.match(email, /invalid_server/);
  assert.match(email, /sender_rejected/);
  assert.match(email, /recipient_rejected/);
  assert.match(email, /no such user/);
  assert.match(email, /replaceAll\(password, "\[redacted\]"\)/);
  assert.match(email, /slice\(0, 300\)/);
  assert.match(email, /nodemailer\.createTransport/);
  assert.match(email, /port: 465/);
  assert.match(email, /secure: true/);
  assert.match(email, /envelope: \{ from, to: \[input\.to\] \}/);
  assert.match(email, /result\.accepted\.length > 0/);
  assert.doesNotMatch(email, /INVITATION_EMAIL_FROM/);
  assert.doesNotMatch(email, /resend/i);
});

test("email copy distinguishes administrator and service-organisation invitations", () => {
  assert.match(email, /ADMIN → SERVICE ORGANISATION/);
  assert.match(email, /Admin invitation to a service organisation/);
  assert.match(email, /ADMIN → LOCATION MANAGER/);
  assert.match(email, /SERVICE ORGANISATION → LOCATION MANAGER/);
  assert.match(email, /issued by the service organisation, not by a platform administrator/);
});

test("every invitation creation action attempts delivery and preserves a fallback link", () => {
  assert.match(adminActions, /kind: "admin_service_organisation"/);
  assert.match(adminActions, /kind: "admin_location_manager"/);
  assert.match(ownerInvitationDelivery, /kind: "service_organisation_location_manager"/);
  assert.match(adminActions, /emailDelivery/);
  assert.match(ownerActions, /emailDelivery/);
  assert.match(ownerActions, /createAndDeliverLocationManagerInvitation/);
  assert.match(adminForms, /state\.emailDelivery === "sent"/);
  assert.match(adminForms, /state\.emailDiagnostic/);
  assert.match(ownerClient, /state\.emailDelivery === "sent"/);
});
