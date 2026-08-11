import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608110046_admin_workshop_claim_payment.sql");
const optionalOwnershipMigration = await read("supabase/migrations/202608110047_unowned_admin_workshop_claims.sql");
const claimCard = await read("app/workshops/[workshopId]/WorkshopClaimCard.tsx");
const claimAction = await read("app/workshops/[workshopId]/claim/actions.ts");
const billing = await read("app/workshop-manager/invoicing/ProviderBillingClient.tsx");
const adminDal = await read("lib/dal/admin-organisations.ts");
const adminForms = await read("app/admin/AdminWorkflowForms.tsx");
const adminActions = await read("app/admin/workflow-actions.ts");

test("administrator-created locations enter an explicit claim lifecycle", () => {
  assert.match(migration, /create type public\.workshop_creation_source/);
  assert.match(migration, /create type public\.workshop_claim_status/);
  assert.match(migration, /alter column creation_source set default 'administrator'/);
  assert.match(migration, /alter column claim_status set default 'unclaimed'/);
  assert.match(migration, /history\.action = 'location_created'/);
  assert.match(migration, /then 'claimed'::public\.workshop_claim_status/);
  assert.match(migration, /else 'unclaimed'::public\.workshop_claim_status/);
  assert.match(migration, /workshops_claim_state_consistent/);
  assert.match(migration, /create trigger workshops_activate_administrator_location/);
  assert.match(migration, /new\.status := 'active'/);
  assert.match(migration, /active_from = coalesce\(workshop\.active_from, current_date\)/);
  assert.match(migration, /new\.active_from := coalesce\(new\.active_from, current_date\)/);
});

test("claiming is organisation-owner scoped and requires complete details", () => {
  const begin = migration.match(/create function public\.begin_my_workshop_claim[\s\S]+?revoke all on function public\.begin_my_workshop_claim/)?.[0] ?? "";
  assert.match(begin, /private\.can_manage_service_organisation/);
  assert.match(begin, /membership\.membership_role = 'owner'/);
  assert.match(begin, /private\.has_complete_service_provider_claim_details/);
  assert.match(begin, /'details_required'/);
  assert.match(begin, /'awaiting_payment'/);
});

test("admin locations can start without an organisation or manager", () => {
  assert.match(optionalOwnershipMigration, /alter column service_provider_id drop not null/);
  assert.match(optionalOwnershipMigration, /workshop_row\.service_provider_id is null/);
  assert.match(optionalOwnershipMigration, /set service_provider_id = provider_id/);
  const create = optionalOwnershipMigration.match(/create or replace function public\.create_admin_workshop_location[\s\S]+?revoke all on function public\.create_admin_workshop_location/)?.[0] ?? "";
  assert.match(create, /requested_service_provider_id is not null and not exists/);
  assert.match(create, /created_workshop_id, requested_service_provider_id/);
  assert.match(optionalOwnershipMigration, /create function public\.get_admin_unowned_workshops/);
  assert.match(adminActions, /providerId: z\.union\(\[z\.literal\(""\), z\.uuid\(\)\]\)/);
  assert.match(adminForms, /adminWorkflow\.providerOptional/);
  assert.match(adminForms, /workshop\.providerId !== null/);
  assert.match(adminDal, /get_admin_unowned_workshops/);
});

test("only paid Stripe subscription states finalize a claim", () => {
  const finalize = migration.match(/create function private\.finalize_paid_workshop_claim[\s\S]+?create trigger workshop_subscriptions_finalize_paid_claim/)?.[0] ?? "";
  assert.match(finalize, /new\.status in \('active', 'trialing'\)/);
  assert.match(finalize, /workshop\.claim_status = 'awaiting_payment'/);
  assert.doesNotMatch(finalize, /grace/);
  assert.match(migration, /workshop\.claim_status in \('not_applicable', 'claimed'\)/);
});

test("admin-curated locations receive a narrow temporary map exception", () => {
  assert.match(migration, /create function private\.is_workshop_discoverable/);
  assert.match(migration, /workshop\.creation_source = 'administrator'[\s\S]+workshop\.claim_status in \('unclaimed', 'awaiting_payment'\)/);
  assert.match(migration, /search_public_workshops[\s\S]+private\.is_workshop_discoverable/);
  const publication = migration.match(/create or replace function private\.is_workshop_publication_eligible[\s\S]+?create function private\.is_workshop_discoverable/)?.[0] ?? "";
  assert.doesNotMatch(publication, /claim_status in \('unclaimed', 'awaiting_payment'\)/);
  assert.match(migration, /nullif\(btrim\(workshop\.city\), ''\) is not null/);
  assert.match(migration, /workshop\.latitude between -90 and 90/);
});

test("owner-created locations remain outside the admin claim lifecycle", () => {
  assert.match(migration, /'organisation_owner', 'not_applicable'/);
});

test("public claim and billing surfaces guide the owner without bypassing payment", () => {
  assert.match(claimCard, /workshopClaim\.button/);
  assert.match(claimCard, /beginWorkshopClaimAction/);
  assert.match(claimCard, /workshopClaim\.chooseOrganisation/);
  assert.match(claimAction, /service-organisation\/billing\?providerId=/);
  assert.match(billing, /claimDetailsTitle/);
  assert.match(billing, /claimPaymentTitle/);
  assert.match(billing, /startStripeCheckoutAction/);
  assert.doesNotMatch(claimAction, /claim_status|claimed_at/);
});

test("administrators can audit claim state and open each pending claim page", () => {
  assert.match(migration, /create function public\.get_admin_workshop_claim_states/);
  assert.match(adminDal, /get_admin_workshop_claim_states/);
  assert.match(adminDal, /claimStatus/);
});
