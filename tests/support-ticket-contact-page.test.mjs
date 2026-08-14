import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [migration, closureMigration, page, client, action, dal, admin, adminPage, styles, english] = await Promise.all([
  read("supabase/migrations/202608140060_support_ticket_system.sql"),
  read("supabase/migrations/202608140061_account_closure_ticket_workflow.sql"),
  read("app/contact/page.tsx"),
  read("app/contact/ContactClient.tsx"),
  read("app/contact/actions.ts"),
  read("lib/dal/support-tickets.ts"),
  read("app/admin/AdminDashboardClient.tsx"),
  read("app/admin/[section]/page.tsx"),
  read("app/globals.css"),
  read("app/i18n/en.json"),
]);

test("public contact modes create validated database-backed tickets", () => {
  assert.match(page, /type === "account-closure"/);
  assert.match(client, /useActionState\(createContactTicketAction/);
  assert.match(client, /state\.reference/);
  assert.match(action, /z\.enum\(\["support", "problem", "account_closure"\]\)/);
  assert.match(action, /companyWebsite: z\.literal\(""\)/);
  assert.match(dal, /rpc\("create_support_ticket"/);
  assert.match(migration, /create table public\.support_tickets/);
  assert.match(migration, /PIT-.*YYYYMMDD/s);
  assert.match(migration, /count\(\*\) >= 5/);
  assert.match(migration, /grant execute.*to anon, authenticated/s);
  assert.doesNotMatch(migration, /policy .*anon.*select/i);
});

test("account closure is a written ticket with an administrator-controlled delay", () => {
  assert.match(client, /contact\.accountClosureNote/);
  assert.match(client, /value="account_closure"/);
  assert.match(closureMigration, /ticket_type in \('support', 'problem', 'account_closure'\)/);
  assert.match(closureMigration, /closure_wait_days in \(30, 60\)/);
  assert.match(closureMigration, /deletion_due_at/);
  assert.match(closureMigration, /private\.is_active_superadmin\(\)/);
  assert.match(closureMigration, /update_admin_support_ticket/);
  assert.match(dal, /rpc\("update_admin_support_ticket"/);
  assert.match(admin, /AccountStatusControl account=\{account\}/);
  assert.match(admin, /scheduled_for_deletion/);
});

test("administrators receive a ticket queue with status and internal notes", () => {
  assert.match(adminPage, /"support"/);
  assert.match(admin, /id: "support", href: "\/admin\/support"/);
  assert.match(admin, /updateSupportTicketAction/);
  assert.match(admin, /adminSupport\.internalNote/);
  assert.match(dal, /loadAdminSupportTickets/);
  assert.match(migration, /support_tickets_superadmin_read/);
  assert.match(migration, /support_tickets_superadmin_update/);
});

test("the contact design uses regular typography and localized guidance", () => {
  const translations = JSON.parse(english);
  assert.equal(translations["contact.submit"], "Create ticket");
  assert.equal(translations["automotiveAdmin.nav.support"], "Support");
  assert.match(styles, /Public support ticket page keeps all new typography at regular weight/);
  const contactStyles = styles.match(/\/\* Public support ticket page[\s\S]+?\.admin-support-queue/)?.[0] ?? "";
  assert.doesNotMatch(contactStyles, /font-weight:(?:[6-9]00|bold)/);
  assert.doesNotMatch(client, /<strong>|<b>/);
});
