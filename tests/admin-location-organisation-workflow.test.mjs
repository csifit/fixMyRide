import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608100040_admin_location_organisation_workflow.sql");
const actions = await read("app/admin/workflow-actions.ts");
const forms = await read("app/admin/AdminWorkflowForms.tsx");
const invitation = await read("app/register/invitation/actions.ts");
const access = await read("lib/dal/platform-access.ts");
const errors = await read("lib/dal/errors.ts");

test("admin workflow mutations are MFA protected and exposed only as RPCs", () => {
  for (const name of [
    "create_admin_service_organisation_invitation",
    "create_admin_workshop_location",
    "create_admin_location_manager_invitation",
    "assign_admin_workshop_manager",
    "set_admin_platform_account_status",
  ]) {
    assert.match(migration, new RegExp(`create function public\\.${name}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}`));
  }
  assert.match(migration, /auth\.jwt\(\)->>'aal'\) = 'aal2'/);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all) on table[^;]+authenticated/i);
});

test("organisation and location invitations keep plaintext secrets out of storage", () => {
  assert.match(actions, /randomBytes\(32\).*base64url/s);
  assert.match(actions, /createHash\("sha256"\)/);
  assert.match(migration, /requested_token_digest !~ '\^\[a-f0-9\]\{64\}\$'/);
  assert.match(migration, /handle_service_provider_invitation_registration/);
  assert.match(migration, /insert into public\.workshop_manager_profiles/);
  assert.match(migration, /insert into public\.workshop_manager_memberships/);
  assert.match(migration, /insert into public\.workshop_manager_assignments/);
  assert.match(migration, /insert into public\.account_identities/);
  assert.doesNotMatch(migration, /returning token_digest|token_plaintext|invitation_token\s+text/i);
  assert.match(invitation, /service_provider_invitation_digest/);
});

test("admin UI creates geocoded locations and assigns new or existing managers", () => {
  assert.match(forms, /GoogleAddressSearch/);
  assert.match(forms, /onSelection=\{\(selection\) => setLocationReady/);
  assert.match(forms, /disabled=\{pending \|\| !locationReady\}/);
  assert.match(actions, /return \{ status: "geocode_required" \}/);
  assert.match(actions, /latitude < -90 \|\| latitude > 90/);
  assert.match(forms, /inviteLocationManagerAction/);
  assert.match(forms, /assignLocationManagerAction/);
  assert.match(forms, /primary_manager/);
  assert.match(migration, /workshop already has a live primary manager/i);
});

test("invalid geocoding is reported as input guidance instead of an outage", () => {
  assert.match(errors, /error\.code === "22023"/);
  assert.match(actions, /status: "geocode_required"/);
});

test("account controls are audited, hierarchy safe, and enforced in access paths", () => {
  assert.match(migration, /Administrators cannot change their own account status/);
  assert.match(migration, /Only Superadmins can manage administrator accounts/);
  assert.match(migration, /last active Superadmin cannot be disabled/);
  assert.match(migration, /insert into public\.platform_account_status_history/);
  assert.match(migration, /identity\.status = 'active'/);
  assert.match(access, /identity\.status === "deactivated" \|\| identity\.status === "blocked"/);
});
