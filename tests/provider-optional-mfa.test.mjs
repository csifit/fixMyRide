import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const sidebar = await read("app/RoleWorkspaceShell.tsx");
const security = await read("app/provider-security/ProviderSecurityClient.tsx");
const challenge = await read("app/provider-security/ProviderMfaChallengeClient.tsx");
const status = await read("lib/dal/provider-mfa.ts");
const proxy = await read("lib/supabase/proxy.ts");
const managerPage = await read("app/workshop-manager/security/page.tsx");
const managerChallenge = await read("app/workshop-manager/security/mfa/page.tsx");
const organisationPage = await read("app/service-organisation/security/page.tsx");
const organisationChallenge = await read("app/service-organisation/security/mfa/page.tsx");
const guidance = await read("app/guidance/content.ts");
const styles = await read("app/globals.css");

test("both provider roles receive a dedicated Security destination", () => {
  assert.match(sidebar, /href: "\/workshop-manager\/security"/);
  assert.match(sidebar, /href: "\/service-organisation\/security"/);
  assert.match(sidebar, /roleSidebar\.nav\.security/);
  assert.match(managerPage, /getWorkshopManagerAccess/);
  assert.match(organisationPage, /getServiceOrganisationAccess/);
  assert.match(managerPage, /role="workshop_manager"/);
  assert.match(organisationPage, /role="service_organisation"/);
});

test("MFA remains optional until a verified TOTP factor exists", () => {
  assert.match(status, /mfa\.listFactors\(\)/);
  assert.match(status, /mfa\.getAuthenticatorAssuranceLevel\(\)/);
  assert.match(status, /factors\.data\.totp\[0\] \?\? null/);
  assert.match(proxy, /assurance\.nextLevel === "aal2"/);
  assert.match(proxy, /assurance\.currentLevel !== "aal2"/);
  assert.match(proxy, /!isProviderMfaChallenge && !isProviderLogin/);
  assert.doesNotMatch(proxy, /mfa\/enroll/);
});

test("provider enrollment creates, verifies, and can securely remove a TOTP factor", () => {
  assert.match(security, /mfa\.enroll\(\{/);
  assert.match(security, /factorType: "totp"/);
  assert.match(security, /issuer: "pitster"/);
  assert.match(security, /mfa\.challengeAndVerify/);
  assert.match(security, /mfa\.unenroll/);
  assert.match(security, /!\/\^\\d\{6\}\$\/\.test\(removeCode\)/);
  assert.match(security, /autoComplete="one-time-code"/);
  assert.match(security, /await supabase\.auth\.refreshSession\(\)/);
});

test("enrolled providers are challenged before returning to a safe provider URL", () => {
  assert.match(proxy, /challenge\.pathname = `\$\{providerRoot\}\/security\/mfa`/);
  assert.match(proxy, /challenge\.searchParams\.set\("next"/);
  assert.match(challenge, /mfa\.challengeAndVerify/);
  assert.match(challenge, /router\.replace\(nextHref\)/);
  for (const page of [managerChallenge, organisationChallenge]) {
    assert.match(page, /safeProviderNext/);
    assert.match(page, /currentLevel === "aal2"/);
    assert.match(page, /ProviderMfaChallengeClient/);
  }
  assert.match(status, /requested\?\.startsWith\(`\$\{root\}\/`\)/);
  assert.match(status, /requested\.startsWith\(`\$\{root\}\/login`\)/);
  assert.match(status, /requested\.startsWith\(`\$\{root\}\/security\/mfa`\)/);
});

test("provider MFA is localized and guidance-aware", async () => {
  const languages = ["en", "de", "ro", "hu"];
  const catalogs = await Promise.all(languages.map(async (language) =>
    JSON.parse(await read(`app/i18n/${language}.json`))));
  const keys = Object.keys(catalogs[0]).filter((key) => key.startsWith("providerSecurity."));
  assert.ok(keys.length >= 30);
  for (const catalog of catalogs) {
    assert.deepEqual(
      Object.keys(catalog).filter((key) => key.startsWith("providerSecurity.")).sort(),
      [...keys].sort(),
    );
    assert.equal(typeof catalog["roleSidebar.nav.security"], "string");
  }
  assert.match(guidance, /copyId: "security"/);
  assert.match(sidebar, /!pathname\.endsWith\("\/security\/mfa"\)/);
});

test("provider Security UI follows readable normal-weight typography", () => {
  const css = styles.slice(styles.indexOf("/* Optional provider multi-factor authentication */"));
  const sizes = [...css.matchAll(/font-size:\s*([0-9.]+)px/g)].map((match) => Number(match[1]));
  assert.equal(sizes.some((size) => size < 10), false);
  assert.doesNotMatch(css, /font(?:-weight|):\s*(?:[5-9][0-9]{2}|bold|bolder)/);
  assert.match(css, /@media \(max-width:700px\)/);
});
