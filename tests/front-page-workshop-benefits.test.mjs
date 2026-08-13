import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const home = await read("app/HomeDiscoveryClient.tsx");
const styles = await read("app/globals.css");
const english = JSON.parse(await read("app/i18n/en.json"));

test("front-page workshop pitch presents collapsible benefits for both provider levels", () => {
  assert.match(home, /<details className="provider-benefits">/);
  assert.match(home, /<summary>/);
  assert.match(home, /home\.offer\.benefits\.organisations/);
  assert.match(home, /home\.offer\.benefits\.workshops/);
  assert.match(home, /provider-offer-highlights/);
  const organisationBenefits = Object.keys(english).filter((key) => key.startsWith("home.offer.benefit.organisation") || ["home.offer.benefit.locationComparison", "home.offer.benefit.consolidatedBilling", "home.offer.benefit.qualityControl", "home.offer.benefit.managerControl", "home.offer.benefit.reporting"].includes(key));
  const workshopBenefits = ["onlineBookings", "calendar", "repairLifecycle", "inventory", "serviceHistory", "loyalty"].map((name) => `home.offer.benefit.${name}`);
  assert.equal(organisationBenefits.length, 6);
  assert.ok(workshopBenefits.every((key) => typeof english[key] === "string"));
});

test("workshop pitch follows the project's golden-ratio responsive layout", () => {
  assert.match(styles, /\.provider-offer[^\{]+\{[^}]+1\.618fr/i);
  assert.match(styles, /\.provider-benefits>div[^\{]+\{[^}]+1\.618fr/i);
  assert.match(styles, /@media \(max-width:600px\)[^\{]*\{[\s\S]*?\.provider-benefits>div[^\{]*\{[^}]*grid-template-columns:1fr/i);
});

test("workshop pitch uses readable regular white text and the footer omits price messaging", () => {
  assert.match(styles, /\.provider-offer-highlights li \{[^}]*color:#fff;[^}]*font-size:12px;[^}]*font-weight:400;/i);
  assert.match(styles, /\.provider-benefits summary span \{[^}]*color:#fff;[^}]*font-size:15px;[^}]*font-weight:400;/i);
  assert.match(styles, /\.provider-benefits summary small \{[^}]*color:#fff;[^}]*font-size:11px;[^}]*font-weight:400;/i);
  assert.match(styles, /\.provider-benefits h3 \{[^}]*color:#fff;[^}]*font:400 21px/i);
  assert.match(styles, /\.provider-benefits li \{[^}]*color:#fff;[^}]*font-size:12px;[^}]*font-weight:400;/i);
  assert.doesNotMatch(home, /<span>€35\/\{t\("home\.offer\.month"\)\} · \{t\("home\.offer\.sms"\)\}<\/span>/);
});
