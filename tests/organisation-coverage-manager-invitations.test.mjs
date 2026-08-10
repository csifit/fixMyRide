import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608100041_organisation_coverage_manager_invitations.sql");
const actions = await read("app/workshop-manager/organisation/actions.ts");
const page = await read("app/workshop-manager/organisation/page.tsx");
const client = await read("app/workshop-manager/organisation/OrganisationCoverageClient.tsx");
const navigation = await read("app/RoleWorkspaceShell.tsx");

test("coverage reads and invitation mutations require an active organisation owner", () => {
  assert.match(migration, /create function private\.can_manage_service_organisation/);
  assert.match(migration, /membership\.membership_role = 'owner'/);
  assert.match(migration, /membership\.status = 'active'/);
  assert.match(migration, /identity\.status = 'active'/);
  assert.match(migration, /create function public\.get_my_service_organisation_coverage/);
  assert.match(migration, /create function public\.create_my_location_manager_invitation/);
  assert.match(migration, /create function public\.revoke_my_location_manager_invitation/);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all) on table[^;]+authenticated/i);
});

test("dashboard exposes per-location coverage and the EUR 35 cost projection without charging", () => {
  assert.match(migration, /plan\.monthly_price_cents \* \([\s\S]+?count\(\*\)/);
  assert.match(migration, /subscription\.status in \('active', 'trialing'\)/);
  assert.match(migration, /coverage_grace_ends_at > now\(\)/);
  assert.match(client, /requiredMonthlyCents/);
  assert.match(client, /unitMonthlyPriceCents/);
  assert.match(client, /primaryManagerName/);
  assert.doesNotMatch(actions, /stripe|checkout|subscription/i);
});

test("owner invitations are hashed, expiring, location scoped, and revocable", () => {
  assert.match(actions, /randomBytes\(32\).*base64url/s);
  assert.match(actions, /createHash\("sha256"\)/);
  assert.match(migration, /requested_token_digest !~ '\^\[a-f0-9\]\{64\}\$'/);
  assert.match(migration, /requested_expires_at > now\(\) \+ interval '30 days'/);
  assert.match(migration, /select workshop\.service_provider_id into provider_id/);
  assert.match(migration, /invitation\.intended_assignment_role = 'primary_manager'[\s\S]+invitation\.status = 'pending'/);
  assert.match(migration, /status = 'revoked', revoked_at = now\(\)/);
  assert.match(migration, /revoked_by_auth_user_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /returning token_digest|token_plaintext/i);
});

test("organisation coverage is reachable only through owner-filtered manager pages", () => {
  assert.match(page, /membershipRole === "owner"/);
  assert.match(page, /loadOrganisationCoverage/);
  assert.match(navigation, /\/workshop-manager\/organisation/);
  assert.match(client, /inviteOrganisationManagerAction/);
  assert.match(client, /revokeOrganisationManagerInvitationAction/);
});
