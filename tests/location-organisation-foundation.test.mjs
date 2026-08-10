import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL(
  "supabase/migrations/202608100039_location_organisation_foundation.sql",
  root,
), "utf8");
const foundationMigration = await readFile(new URL(
  "supabase/migrations/202608060022_automotive_booking_foundation.sql",
  root,
), "utf8");

test("platform account controls are canonical, role-neutral, and immutable", () => {
  assert.match(migration, /create type public\.platform_account_status[\s\S]+?'active'[\s\S]+?'deactivated'[\s\S]+?'blocked'/i);
  assert.match(migration, /alter table public\.account_identities[\s\S]+?status public\.platform_account_status not null default 'active'/i);
  assert.match(migration, /create table public\.platform_account_status_history/i);
  assert.match(migration, /previous_status[\s\S]+new_status[\s\S]+reason[\s\S]+changed_by_auth_user_id/i);
  assert.match(migration, /platform_account_status_history_immutable/i);
});

test("location assignments enforce organisation scope and one live primary manager", () => {
  assert.match(migration, /create table public\.workshop_manager_assignments/i);
  assert.match(migration, /workshop_manager_id uuid not null[\s\S]+references public\.workshop_manager_profiles/i);
  assert.match(migration, /workshop_one_live_primary_manager_idx[\s\S]+assignment_role = 'primary_manager'/i);
  assert.match(migration, /validate_workshop_manager_assignment_scope/i);
  assert.match(migration, /membership\.service_provider_id = resolved_provider_id/i);
  assert.match(migration, /membership\.status in \('invited', 'active', 'suspended'\)/i);
});

test("organisation and location invitations are hashed, expiring, and scoped", () => {
  assert.match(migration, /service_provider_invitation_kind[\s\S]+organisation_owner[\s\S]+location_manager/i);
  assert.match(migration, /create table public\.service_provider_invitations/i);
  assert.match(migration, /token_digest text not null unique[\s\S]+\{64\}/i);
  assert.match(migration, /expires_at timestamptz not null/i);
  assert.match(migration, /service_provider_one_pending_invitation_idx/i);
  assert.match(migration, /validate_service_provider_invitation_scope/i);
  assert.doesNotMatch(migration, /invitation_token\s+text|plaintext_token/i);
});

test("location billing has one shadow subscription per workshop at the existing EUR 35 plan", () => {
  assert.match(migration, /create table public\.service_provider_stripe_customers/i);
  assert.match(migration, /create table public\.workshop_subscriptions[\s\S]+workshop_id uuid primary key/i);
  assert.match(migration, /insert into public\.workshop_subscriptions \(workshop_id\)[\s\S]+select workshop\.id/i);
  assert.match(migration, /create trigger workshops_initialize_subscription/i);
  assert.match(migration, /create trigger service_providers_initialize_stripe_customer/i);
  assert.match(migration, /create trigger provider_subscriptions_sync_stripe_customer/i);
  assert.match(migration, /coverage_grace_ends_at timestamptz/i);
  assert.match(migration, /alter table public\.provider_invoices[\s\S]+add column workshop_id/i);
  assert.match(foundationMigration, /values \('standard', 'Service provider', 3500, 'EUR', true\)/i);
});

test("new organisation tables are deny-by-default and the migration does not cut over runtime contracts", () => {
  for (const table of [
    "platform_account_status_history",
    "service_provider_invitations",
    "workshop_manager_assignments",
    "service_provider_stripe_customers",
    "workshop_subscriptions",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(migration, /revoke all on table public\.platform_account_status_history,[\s\S]+from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all) on table[^;]+authenticated/i);
  assert.doesNotMatch(migration, /create or replace function public\.(?:search_public_workshops|apply_stripe|create_public_service_booking_request|manage_service_booking_request)/i);
  assert.doesNotMatch(migration, /drop (?:table|type|function|column)/i);
});
