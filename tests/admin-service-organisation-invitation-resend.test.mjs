import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608110051_admin_service_organisation_invitation_resend.sql");
const dal = await read("lib/dal/admin-organisations.ts");
const actions = await read("app/admin/workflow-actions.ts");
const forms = await read("app/admin/AdminWorkflowForms.tsx");
const email = await read("lib/email/invitation-emails.ts");

test("resend rotates only a pending organisation-owner invitation under an MFA admin lock", () => {
  assert.match(migration, /create function public\.resend_admin_service_organisation_invitation/);
  assert.match(migration, /private\.is_active_platform_admin\(\)/);
  assert.match(migration, /invitation\.invitation_kind = 'organisation_owner'/);
  assert.match(migration, /invitation\.status = 'pending'/);
  assert.match(migration, /for update of invitation/i);
  assert.match(migration, /set token_digest = requested_token_digest,[\s\S]+expires_at = requested_expires_at/i);
  assert.match(migration, /requested_token_digest !~ '\^\[a-f0-9\]\{64\}\$'/);
  assert.doesNotMatch(migration, /returning token_digest|token_plaintext|invitation_token\s+text/i);
});

test("resend is audited and exposed only through the authenticated RPC", () => {
  assert.match(migration, /'organisation_invitation_resent'/);
  assert.match(migration, /insert into public\.platform_organisation_admin_history/);
  assert.match(migration, /revoke all on function public\.resend_admin_service_organisation_invitation[\s\S]+from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.resend_admin_service_organisation_invitation[\s\S]+to authenticated/i);
  assert.match(dal, /resendAdminOrganisationInvitation/);
});

test("admin pending invitations can issue and deliver a replacement link", () => {
  assert.match(forms, /resendServiceOrganisationInvitationAction/);
  assert.match(forms, /adminWorkflow\.resendInvitation/);
  assert.match(forms, /item\.kind === "organisation_owner"/);
  assert.match(actions, /randomBytes\(32\).*base64url/s);
  assert.match(actions, /replacement: true/);
  assert.match(actions, /status: "resent"/);
  assert.match(email, /REPLACEMENT/);
  assert.match(email, /invalidates every earlier invitation link/);
  assert.match(forms, /!state\.emailDelivery \|\| state\.emailDelivery === "sent"/);
});
