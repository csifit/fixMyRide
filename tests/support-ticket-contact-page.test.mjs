import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [migration, page, client, action, dal, admin, adminPage, styles, english] = await Promise.all([
  read("supabase/migrations/202608140060_support_ticket_system.sql"),
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
  assert.match(page, /type === "problem" \? "problem" : "support"/);
  assert.match(client, /useActionState\(createContactTicketAction/);
  assert.match(client, /state\.reference/);
  assert.match(action, /z\.enum\(\["support", "problem"\]\)/);
  assert.match(action, /companyWebsite: z\.literal\(""\)/);
  assert.match(dal, /rpc\("create_support_ticket"/);
  assert.match(migration, /create table public\.support_tickets/);
  assert.match(migration, /PIT-.*YYYYMMDD/s);
  assert.match(migration, /count\(\*\) >= 5/);
  assert.match(migration, /grant execute.*to anon, authenticated/s);
  assert.doesNotMatch(migration, /policy .*anon.*select/i);
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

