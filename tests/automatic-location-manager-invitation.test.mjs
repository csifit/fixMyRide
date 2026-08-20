import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const actions = await read("app/workshop-manager/workshops/actions.ts");
const client = await read("app/workshop-manager/workshops/WorkshopOperationsClient.tsx");
const delivery = await read("lib/location-manager-invitations.ts");

test("a new location public email creates a primary-manager invitation", () => {
  assert.match(actions, /const workshopId = await createMyWorkshopLocation\(parsed\.data\)/);
  assert.match(actions, /if \(!parsed\.data\.publicEmail\) return \{ status: "location_created" \}/);
  assert.match(actions, /createAndDeliverLocationManagerInvitation\(\{/);
  assert.match(actions, /workshopId,[\s\S]+email: parsed\.data\.publicEmail/);
  assert.match(actions, /assignmentRole: "primary_manager"/);
});

test("automatic invitations retain the secure existing delivery contract", () => {
  assert.match(delivery, /^import "server-only";/);
  assert.match(delivery, /randomBytes\(32\).*base64url/s);
  assert.match(delivery, /createHash\("sha256"\)/);
  assert.match(delivery, /Date\.now\(\) \+ 7 \* 86_400_000/);
  assert.match(delivery, /sendInvitationEmail\(\{/);
  assert.match(delivery, /kind: "service_organisation_location_manager"/);
  assert.match(delivery, /invitationUrl: url\.toString\(\)/);
});

test("location success remains truthful when invitation delivery fails", () => {
  assert.match(actions, /status: "location_created_invited"/);
  assert.match(actions, /status: "location_created_invitation_failed"/);
  assert.match(client, /state\.emailDelivery === "sent"/);
  assert.match(client, /state\.invitationUrl/);
  assert.match(client, /organisationCoverage\.copyLinkHelp/);
  assert.match(client, /organisationCoverage\.invitationEmail/);
});

test("the form explains the public-email invitation before submission", async () => {
  assert.match(client, /workshopOperations\.publicEmailManagerInviteHelp/);
  const catalogs = await Promise.all(["en", "de", "ro", "hu"].map(async (language) =>
    JSON.parse(await read(`app/i18n/${language}.json`))));
  for (const catalog of catalogs) {
    assert.ok(catalog["workshopOperations.publicEmailManagerInviteHelp"]);
    assert.ok(catalog["workshopOperations.result.location_created_invited"]);
    assert.ok(catalog["workshopOperations.result.location_created_invitation_failed"]);
  }
});
