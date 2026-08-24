import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608240073_platform_email_blocklist.sql");
const dashboard = await read("app/admin/AdminDashboardClient.tsx");
const forms = await read("app/admin/AdminWorkflowForms.tsx");
const actions = await read("app/admin/workflow-actions.ts");
const adminDal = await read("lib/dal/admin-organisations.ts");
const blockDal = await read("lib/dal/email-blocklist.ts");
const login = await read("app/authentication/actions.ts");
const registration = await read("app/register/actions.ts");
const invitation = await read("app/register/invitation/actions.ts");
const recovery = await read("app/forgot-password/actions.ts");
const styles = await read("app/globals.css");
const dictionaries = await Promise.all(
  ["en", "de", "ro", "hu"].map(async (language) =>
    JSON.parse(await read(`app/i18n/${language}.json`)),
  ),
);

test("administrators can audit exact unregistered email restrictions", () => {
  assert.match(migration, /create table public\.platform_email_blocklist/);
  assert.match(migration, /email = lower\(btrim\(email\)\)/);
  assert.match(migration, /create table public\.platform_email_block_history/);
  assert.match(migration, /platform_email_block_history_immutable/);
  assert.match(migration, /create function public\.set_admin_email_block_status/);
  assert.match(migration, /private\.is_active_platform_admin\(\)/);
  assert.match(migration, /Use the registered account control for this email/);
  assert.match(migration, /revoke all on table public\.platform_email_blocklist,[\s\S]*from public, anon, authenticated/);
});

test("the database blocks registration, tickets and bookings at their write boundaries", () => {
  assert.match(migration, /before insert or update of email on auth\.users/);
  assert.match(migration, /before insert or update of requester_email on public\.support_tickets/);
  assert.match(migration, /before insert or update of customer_email on public\.service_booking_requests/);
  assert.equal((migration.match(/where block\.email = lower\(btrim\(new\.[^)]+\)\) and block\.blocked/g) ?? []).length, 3);
});

test("public authentication flows fail closed without revealing blocklist membership", () => {
  assert.match(blockDal, /createServiceClient\(\)/);
  assert.match(blockDal, /from\("platform_email_blocklist"\)/);
  assert.match(login, /isPlatformEmailBlocked\(input\.data\.email\)/);
  assert.match(login, /return \{ error: "invalid_credentials" \}/);
  assert.match(login, /identity\.status !== "active"/);
  assert.match(registration, /isPlatformEmailBlocked\(input\.data\.email\)/);
  assert.match(invitation, /isPlatformEmailBlocked\(invitation\.email\)/);
  assert.match(recovery, /isPlatformEmailBlocked\(input\.data\.email\)[\s\S]*return \{ status: "sent" \}/);
});

test("the admin Security page manages manual emails separately from registered accounts", () => {
  assert.match(adminDal, /get_admin_email_blocklist/);
  assert.match(adminDal, /set_admin_email_block_status/);
  assert.match(actions, /setEmailBlockStatusAction/);
  assert.match(forms, /EmailBlocklistAdministration/);
  assert.match(forms, /name="email" type="email"/);
  assert.match(forms, /option value="true"/);
  assert.match(forms, /option value="false"/);
  assert.match(dashboard, /entries=\{data\.workflow\.emailBlocks\}/);
  assert.match(dashboard, /adminEmailBlocklist\.registeredAccounts/);
  assert.ok(
    dashboard.indexOf('adminEmailBlocklist.registeredAccounts')
      < dashboard.indexOf("<EmailBlocklistAdministration"),
  );
});

test("email blocklist guidance is translated and readable", () => {
  const keys = Object.keys(dictionaries[0]).filter((key) => key.startsWith("adminEmailBlocklist.")).sort();
  assert.ok(keys.length >= 10);
  for (const dictionary of dictionaries) {
    assert.deepEqual(
      Object.keys(dictionary).filter((key) => key.startsWith("adminEmailBlocklist.")).sort(),
      keys,
    );
  }
  const blockStyles = styles.slice(styles.indexOf("/* Administrator exact-email blocklist */"));
  assert.match(blockStyles, /admin-email-block-create/);
  const sizes = [...blockStyles.matchAll(/font-size\s*:\s*([0-9.]+)px/g)].map((match) => Number(match[1]));
  assert.equal(sizes.some((size) => size > 0 && size < 10), false);
  assert.doesNotMatch(blockStyles, /font-weight\s*:\s*(?:bold|bolder|[5-9]00)/);
});
