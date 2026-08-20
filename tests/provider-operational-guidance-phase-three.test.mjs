import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const guidance = await read("app/guidance/OperationalGuidance.tsx");
const catalogue = await read("app/workshop-manager/services/ServiceCatalogueClient.tsx");
const profile = await read("app/workshop-manager/workshops/WorkshopOperationsClient.tsx");
const capacity = await read("app/workshop-manager/capacity/CapacityResourcesClient.tsx");
const requests = await read("app/workshop-manager/requests/WorkshopBookingInboxClient.tsx");
const calendar = await read("app/workshop-manager/requests/WorkshopBookingCalendar.tsx");
const inventory = await read("app/inventory/WorkshopInventoryClient.tsx");
const styles = await read("app/globals.css");
const english = JSON.parse(await read("app/i18n/en.json"));

test("Phase 3 defines consistent introduction, field-help and empty-state patterns", () => {
  assert.match(guidance, /function OperationalIntroduction/);
  assert.match(guidance, /function FieldHelp/);
  assert.match(guidance, /function OperationalEmptyState/);
  assert.match(guidance, /<aside className="operational-introduction"/);
  assert.match(guidance, /className="operational-field-help"/);
  assert.match(guidance, /className="operational-empty-state"/);
});

test("all five core operational areas include an actionable introduction", () => {
  const areas = [catalogue, profile, capacity, requests, inventory];
  for (const source of areas) assert.match(source, /<OperationalIntroduction/);
  for (const key of ["catalogue", "profile", "capacity", "requests", "inventory"]) {
    assert.equal(typeof english[`phase3.${key}.intro`], "string");
    assert.equal(typeof english[`phase3.${key}.outcome`], "string");
    for (let step = 1; step <= 3; step += 1) assert.equal(typeof english[`phase3.${key}.step${step}`], "string");
  }
});

test("field help is attached to the decisions most likely to need explanation", () => {
  for (const source of [catalogue, profile, capacity, requests, calendar, inventory]) assert.match(source, /<FieldHelp/);
  assert.match(catalogue, /phase3\.catalogue\.bookingModeHelp/);
  assert.match(profile, /phase3\.profile\.capacityHelp/);
  assert.match(capacity, /phase3\.capacity\.assignmentHelp/);
  assert.match(requests, /phase3\.requests\.actionTimeHelp/);
  assert.match(inventory, /phase3\.inventory\.thresholdHelp/);
});

test("zero-data and filtered states provide a relevant next action", () => {
  for (const source of [catalogue, profile, capacity, requests, calendar, inventory]) assert.match(source, /<OperationalEmptyState/);
  assert.match(catalogue, /#add-service-/);
  assert.match(profile, /#create-location/);
  assert.match(capacity, /capacity\.noPersonnel/);
  assert.match(capacity, /capacity\.noWorkstations/);
  assert.match(calendar, /#manual-appointment/);
  assert.match(inventory, /setStockFilter\("all"\)/);
});

test("shared provider pages preserve role-aware navigation", () => {
  assert.match(catalogue, /@\/app\/WorkspaceLink/);
  assert.match(capacity, /@\/app\/WorkspaceLink/);
  assert.match(calendar, /@\/app\/WorkspaceLink/);
  assert.match(profile, /portalBasePath/);
  assert.match(inventory, /portalBasePath/);
});

test("Phase 3 guidance remains readable and normal weight", () => {
  const guidanceCss = styles.slice(styles.indexOf("/* Core operational guidance — Phase 3 */"));
  const sizes = [...guidanceCss.matchAll(/font-size:\s*([0-9.]+)px/g)].map((match) => Number(match[1]));
  assert.equal(sizes.some((size) => size < 10), false);
  assert.doesNotMatch(guidanceCss, /font(?:-weight|):\s*(?:[5-9][0-9]{2}|bold|bolder)/);
});
