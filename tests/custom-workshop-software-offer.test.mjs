import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const page = await read("app/custom-workshop-software/page.tsx");
const offer = await read("app/custom-workshop-software/CustomWorkshopSoftwareClient.tsx");
const home = await read("app/HomeDiscoveryClient.tsx");
const sitemap = await read("app/sitemap.ts");
const styles = await read("app/globals.css");
const dictionaries = await Promise.all(
  ["en", "de", "ro", "hu"].map(async (language) =>
    JSON.parse(await read(`app/i18n/${language}.json`)),
  ),
);

test("the public offer has discoverable metadata, footer navigation and sitemap coverage", () => {
  assert.match(page, /title: "Custom workshop management software \| Pitster"/);
  assert.match(page, /canonical: "\/custom-workshop-software"/);
  assert.match(home, /href="\/custom-workshop-software"/);
  assert.match(home, /home\.footer\.customSoftware/);
  assert.match(sitemap, /`\$\{canonicalOrigin\}\/custom-workshop-software`/);
  for (const dictionary of dictionaries) {
    assert.equal(typeof dictionary["home.footer.customSoftware"], "string");
    assert.ok(dictionary["home.footer.customSoftware"].length > 0);
  }
});

test("the offer addresses organisations, dealerships and workshop operations", () => {
  assert.match(offer, /Service organisations/);
  assert.match(offer, /Dealership service departments/);
  assert.match(offer, /multi-location workshop groups/);
  assert.match(offer, /Bookings and work orders/);
  assert.match(offer, /Capacity and resources/);
  assert.match(offer, /Parts and inventory/);
  assert.match(offer, /Customer communication/);
  assert.match(offer, /Private and standalone/);
  assert.match(offer, /Connected to Pitster/);
});

test("both requested contact addresses are direct email actions", () => {
  assert.match(offer, /"admin@pitster\.app"/);
  assert.match(offer, /"admin@mkdir\.click"/);
  assert.match(offer, /href={`mailto:\$\{email\}/);
});

test("the offer follows the platform's readable, responsive typography", () => {
  assert.match(styles, /\/\* Custom workshop software public offer \*\//);
  assert.match(styles, /@media \(max-width:620px\).*\.custom-software-footer/s);
  const offerStyles = styles.slice(styles.indexOf("/* Custom workshop software public offer */"));
  const sizes = [...offerStyles.matchAll(/font-size\s*:\s*([0-9.]+)px/g)]
    .map((match) => Number(match[1]));
  assert.equal(sizes.some((size) => size > 0 && size < 10), false);
  assert.doesNotMatch(offerStyles, /font-weight\s*:\s*(?:bold|bolder|[5-9]00)/);
});
