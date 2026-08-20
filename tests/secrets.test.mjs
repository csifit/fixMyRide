import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const scannedRoots = ["app", "lib", "supabase"];

test("the committed environment template contains only blank public values", async () => {
  const example = await readFile(path.join(root, ".env.example"), "utf8");
  assert.equal(
    example.replaceAll("\r\n", "\n"),
    "NEXT_PUBLIC_SUPABASE_URL=\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\nNEXT_PUBLIC_SITE_URL=\nNEXT_PUBLIC_BRAND_ID=\nNEXT_PUBLIC_BRAND_NAME=\nNEXT_PUBLIC_BRAND_MARK=\nNEXT_PUBLIC_BRAND_PRIMARY_COLOR=\nNEXT_PUBLIC_BRAND_SUPPORT_EMAIL=\nNEXT_PUBLIC_BRAND_TIME_ZONE=\nMXROUTE_SERVER=\nMXROUTE_USERNAME=\nMXROUTE_PASSWORD=\nNEXT_PUBLIC_GOOGLE_MAPS_API_KEY=\nNEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=\nSUPABASE_SECRET_KEY=\nSMSLINK_CONNECTION_ID=\nSMSLINK_PASSWORD=\nSMSLINK_TEST_MODE=true\nWHATSAPP_ACCESS_TOKEN=\nWHATSAPP_PHONE_NUMBER_ID=\nWHATSAPP_GRAPH_API_VERSION=\nWHATSAPP_TEMPLATE_BOOKING_UPDATE=\nWHATSAPP_TEMPLATE_LANGUAGE_EN=en_US\nWHATSAPP_TEMPLATE_LANGUAGE_DE=de\nWHATSAPP_TEMPLATE_LANGUAGE_RO=ro\nWHATSAPP_TEMPLATE_LANGUAGE_HU=hu\nWHATSAPP_WEBHOOK_VERIFY_TOKEN=\nWHATSAPP_APP_SECRET=\nNEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER=\nCRON_SECRET=\nSTRIPE_SECRET_KEY=\nSTRIPE_WEBHOOK_SECRET=\nSTRIPE_STANDARD_MONTHLY_PRICE_ID=\n",
  );
});

test("service credential is isolated to the server-only client and source contains no token-shaped secret", async () => {
  const files = (await Promise.all(scannedRoots.map((entry) => walk(path.join(root, entry))))).flat();
  files.push(path.join(root, "proxy.ts"), path.join(root, "SECURITY.md"));
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /sb_secret_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, path.relative(root, file));
    assert.doesNotMatch(text, /sk_(?:test|live)_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{20,}/, path.relative(root, file));
    if (text.includes("SUPABASE_SECRET_KEY")) {
      assert.equal(path.relative(root, file), path.join("lib", "supabase", "service.ts"));
      assert.match(text, /^import "server-only";/);
    }
    if (text.includes("STRIPE_SECRET_KEY") || text.includes("STRIPE_WEBHOOK_SECRET")) {
      assert.equal(path.relative(root, file), path.join("lib", "stripe", "server.ts"));
      assert.match(text, /^import "server-only";/);
    }
  }
});

test("server authorization never calls getSession", async () => {
  for (const file of await walk(path.join(root, "lib"))) {
    const text = await readFile(file, "utf8");
    assert.equal(text.includes(".auth.getSession("), false, path.relative(root, file));
  }
});

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(entryPath));
    else if (/\.(?:json|md|mjs|sql|ts|tsx)$/.test(entry.name)) files.push(entryPath);
  }
  return files;
}
