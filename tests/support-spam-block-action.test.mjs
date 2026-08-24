import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608240074_support_spam_block_action.sql");
const dashboard = await read("app/admin/AdminDashboardClient.tsx");
const supportActions = await read("app/admin/support-actions.ts");
const supportDal = await read("lib/dal/support-tickets.ts");
const securityForms = await read("app/admin/AdminWorkflowForms.tsx");
const styles = await read("app/globals.css");
const dictionaries = await Promise.all(
  ["en", "de", "ro", "hu"].map(async (language) =>
    JSON.parse(await read(`app/i18n/${language}.json`)),
  ),
);

test("marking a ticket as spam atomically closes it and blocks its email", () => {
  assert.match(migration, /create function public\.mark_support_ticket_spam_and_block_email/);
  assert.match(migration, /private\.is_active_superadmin\(\)/);
  assert.match(migration, /insert into public\.platform_email_blocklist/);
  assert.match(migration, /insert into public\.platform_email_block_history/);
  assert.match(migration, /update public\.support_tickets[\s\S]*status = 'closed'/);
  assert.match(migration, /is_spam = true/);
  assert.match(migration, /when ticket_type = 'account_closure' then 'cancelled'/);
});

test("a public ticket cannot be used to block a spoofed registered-account email", () => {
  assert.match(migration, /select 1 from auth\.users users/);
  assert.match(migration, /Registered account email requires account controls/);
  assert.match(migration, /using errcode = '23505'/);
  assert.match(supportActions, /error\.code === "conflict"/);
  assert.match(supportActions, /registered_account/);
});

test("the support accordion exposes the one-click spam control and spam state", () => {
  assert.match(supportDal, /is_spam, spam_marked_at/);
  assert.match(supportDal, /mark_support_ticket_spam_and_block_email/);
  assert.match(supportActions, /revalidatePath\("\/admin\/security"\)/);
  assert.match(dashboard, /SpamTicketControl/);
  assert.match(dashboard, /adminSupport\.markSpam/);
  assert.match(dashboard, /window\.confirm\(t\("adminSupport\.spamConfirm"\)\)/);
  assert.match(dashboard, /ticket\.isSpam \? "spam"/);
  assert.match(styles, /admin-support-spam-action/);
  assert.match(styles, /admin-status\.spam/);
});

test("blocked email rows remain compact until their controls are opened", () => {
  assert.match(securityForms, /<details className="admin-email-block-row">/);
  assert.match(securityForms, /<summary><strong>\{entry\.email\}/);
  assert.match(styles, /\.admin-email-block-row>summary \{ display:grid;/);
  assert.match(styles, /min-height:42px/);
  assert.match(styles, /\.admin-email-block-row\[open\]>summary/);
});

test("spam actions are translated in every supported language", () => {
  const keys = Object.keys(dictionaries[0]).filter((key) => key.startsWith("adminSupport.spam") || key === "adminSupport.markSpam").sort();
  assert.ok(keys.length >= 8);
  for (const dictionary of dictionaries) {
    assert.deepEqual(
      Object.keys(dictionary).filter((key) => key.startsWith("adminSupport.spam") || key === "adminSupport.markSpam").sort(),
      keys,
    );
  }
});
