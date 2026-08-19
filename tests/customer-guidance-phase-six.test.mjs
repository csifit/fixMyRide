import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [component, garage, request, bookings, history, css, en, de, ro, hu] = await Promise.all([
  read("app/guidance/CustomerGuidance.tsx"),
  read("app/garage/GarageClient.tsx"),
  read("app/workshops/[workshopId]/request/ServiceRequestFlow.tsx"),
  read("app/customer/bookings/CustomerBookingsClient.tsx"),
  read("app/garage/[vehicleId]/VehicleServiceHistoryClient.tsx"),
  read("app/globals.css"),
  read("app/i18n/en.json"), read("app/i18n/de.json"), read("app/i18n/ro.json"), read("app/i18n/hu.json"),
]);

test("customer guidance uses compact page, decision and field-hint patterns", () => {
  assert.match(component, /export function CustomerPageGuide/);
  assert.match(component, /export function CustomerDecisionGuide/);
  assert.match(component, /export function CustomerHint/);
  assert.match(css, /Customer guidance — Phase 6/);
  assert.match(css, /\.customer-page-guide/);
  assert.match(css, /\.customer-decision-guide/);
  assert.doesNotMatch(css.match(/\/\* Customer guidance — Phase 6 \*\/[\s\S]*$/)?.[0] ?? "", /font-size:\s*[0-9](?:px)?\b/);
});

test("My Garage explains vehicle reuse and follows the selected language", () => {
  assert.match(garage, /CustomerPageGuide/);
  assert.match(garage, /phase6\.garage\.step1/);
  assert.match(garage, /translate\(language, key\)/);
  assert.match(garage, /phase6\.garage\.vinHelp/);
  assert.doesNotMatch(garage, />My Garage</);
});

test("booking requests explain confirmation and the useful input fields", () => {
  assert.match(request, /phase6\.request\.title/);
  assert.match(request, /phase6\.request\.preferredHelp/);
  assert.match(request, /phase6\.request\.alternativeHelp/);
  assert.match(request, /phase6\.request\.noteHelp/);
});

test("appointment proposals and repair estimates explain both decisions", () => {
  assert.match(bookings, /phase6\.proposals\.accept/);
  assert.match(bookings, /phase6\.proposals\.decline/);
  assert.match(bookings, /phase6\.approvals\.approve/);
  assert.match(bookings, /phase6\.approvals\.decline/);
  assert.match(bookings, /item\.lineTotalCents/);
});

test("service history explains records, recommendations and PDF sharing", () => {
  assert.match(history, /phase6\.history\.title/);
  assert.match(history, /phase6\.history\.step2/);
  assert.match(history, /phase6\.history\.bookService/);
});

test("Phase 6 and Garage translations have exact parity", () => {
  const dictionaries = [en, de, ro, hu].map(JSON.parse);
  const relevant = (dictionary) => Object.keys(dictionary).filter((key) => key.startsWith("phase6.") || key.startsWith("garage."));
  const expected = relevant(dictionaries[0]);
  assert.ok(expected.length >= 75);
  for (const dictionary of dictionaries.slice(1)) assert.deepEqual(relevant(dictionary), expected);
});
