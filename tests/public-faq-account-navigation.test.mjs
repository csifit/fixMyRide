import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [faq, faqClient, home, header, providerMenu, login, english, sitemap] = await Promise.all([
  read("app/faq/page.tsx"),
  read("app/faq/FaqClient.tsx"),
  read("app/HomeDiscoveryClient.tsx"),
  read("app/PublicSiteHeader.tsx"),
  read("app/PublicProviderMenu.tsx"),
  read("app/authentication/PlatformLoginForm.tsx"),
  read("app/i18n/en.json"),
  read("app/sitemap.ts"),
]);

test("the public FAQ explains provider roles and common platform questions", () => {
  const translations = JSON.parse(english);
  assert.match(faq, /<FaqClient \/>/);
  assert.match(faqClient, /const \[language\] = useLanguage\(\)/);
  assert.match(faqClient, /faq\.q\$\{number\}\.question/);
  assert.match(faqClient, /href="\/contact\?type=support"/);
  assert.match(translations["faq.q1.question"], /difference between a Service Organisation and a Workshop account/);
  assert.match(translations["faq.q2.answer"], /Service Organisation sends an invitation to the manager’s email address/);
  assert.match(translations["faq.q6.question"], /When does billing begin/);
  assert.match(translations["faq.q7.question"], /What happens if an organisation payment fails/);
});

test("the footer links the FAQ from its Contact column", () => {
  assert.match(home, /<strong>\{t\("home\.footer\.contact"\)\}<\/strong><Link href="\/faq">/);
  assert.equal(JSON.parse(english)["home.footer.faq"], "Frequently asked questions");
  assert.match(sitemap, /`\$\{canonicalOrigin\}\/faq`/);
  assert.match(home, /href="\/contact\?type=support"/);
  assert.match(home, /href="\/contact\?type=problem"/);
  assert.match(sitemap, /`\$\{canonicalOrigin\}\/contact`/);
});

test("public headers distinguish customer, organisation, and workshop access", () => {
  assert.match(home, /href="\/customer\/login">\{t\("home\.nav\.garage"\)\}/);
  assert.match(header, /href="\/customer\/login">\{t\("home\.nav\.garage"\)\}/);
  assert.match(home, /<PublicProviderMenu/);
  assert.match(header, /<PublicProviderMenu/);
  assert.equal(JSON.parse(english)["home.nav.garage"], "Customer account");
  assert.equal(JSON.parse(english)["home.nav.serviceOrganisationAccess"], "Service organisation login/register");
  assert.equal(JSON.parse(english)["home.nav.workshopLogin"], "Workshop login");
});

test("provider menu offers organisation registration but workshop login only", () => {
  assert.match(providerMenu, /href="\/service-organisation\/login"/);
  assert.match(providerMenu, /href="\/register\/workshop-manager"/);
  assert.match(providerMenu, /href="\/workshop-manager\/login"/);
  assert.match(login, /portal === "service_organisation".*href="\/register\/workshop-manager"/s);
  assert.match(login, /portal === "workshop_manager".*platformLogin\.invitationOnly/s);
  assert.doesNotMatch(login, /portal === "workshop_manager"[^\n]*href="\/register\/workshop-manager"/);
});
