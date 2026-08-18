import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const migration = await read("supabase/migrations/202608180064_admin_invitation_promotional_trials.sql");
const actions = await read("app/admin/workflow-actions.ts");
const forms = await read("app/admin/AdminWorkflowForms.tsx");
const billingActions = await read("app/workshop-manager/invoicing/actions.ts");
const billingDal = await read("lib/dal/provider-billing.ts");
const invitationPage = await read("app/register/invitation/page.tsx");
const email = await read("lib/email/invitation-emails.ts");

test("admin organisation invitations reserve one unclaimed workshop and an explicit trial", () => {
  assert.match(migration, /add column claim_workshop_id uuid/);
  assert.match(migration, /promotional_trial_days in \(60, 90\)/);
  assert.match(migration, /service_provider_one_pending_claim_invitation_idx/);
  assert.match(migration, /workshop\.creation_source = 'administrator'/);
  assert.match(migration, /workshop\.claim_status = 'unclaimed'/);
  assert.match(migration, /subscription\.promotional_trial_started_at is null/);
  assert.match(actions, /promotionalTrialDays:[\s\S]+z\.literal\(60\)[\s\S]+z\.literal\(90\)/);
  assert.match(forms, /name="workshopId"/);
  assert.match(forms, /name="promotionalTrialDays"/);
});

test("acceptance permanently claims the workshop and starts the trial atomically", () => {
  const registration = migration.match(/create or replace function private\.handle_service_provider_invitation_registration[\s\S]+?revoke all on function private\.handle_service_provider_invitation_registration/)?.[0] ?? "";
  assert.match(registration, /for update/);
  assert.match(registration, /set service_provider_id = invitation\.service_provider_id/);
  assert.match(registration, /'primary_manager', 'active'/);
  assert.match(registration, /set promotional_trial_started_at = accepted_timestamp/);
  assert.match(registration, /make_interval\(days => invitation\.promotional_trial_days\)/);
  assert.match(registration, /set claim_status = 'claimed'/);
  assert.match(registration, /'workshop_claimed_with_trial'/);
  assert.doesNotMatch(registration, /set status = 'trialing'/);
});

test("promotional access expires without undoing workshop ownership", () => {
  const coverage = migration.match(/create or replace function private\.has_workshop_billing_coverage[\s\S]+?revoke all on function private\.has_workshop_billing_coverage/)?.[0] ?? "";
  assert.match(coverage, /promotional_trial_ends_at > now\(\)/);
  assert.match(coverage, /organisation_billing\.payment_method_confirmed_at is not null/);
  assert.doesNotMatch(coverage, /claim_status/);
  assert.match(billingDal, /coverageState: "covered" \| "trial"/);
  assert.match(migration, /preserve_promotional_trial_billable_from/);
});

test("billing setup converts an active promotion to a Stripe trial ending on the recorded date", () => {
  assert.match(billingActions, /promotionalTrialEnd/);
  assert.match(billingActions, /trial_end: promotionalTrialEnd/);
  assert.match(billingActions, /missing_payment_method: "pause"/);
  assert.match(billingActions, /location\.promotionalTrialStartedAt[\s\S]+billing_cycle_anchor/);
});

test("claim and trial terms are visible before acceptance and in invitation email", () => {
  assert.match(invitationPage, /promotional_trial_days/);
  assert.match(invitationPage, /claim_workshop:workshops!/);
  assert.match(email, /starts a \$\{input\.promotionalTrialDays\}-day free trial/);
  assert.match(email, /€35 per workshop per month/);
});
