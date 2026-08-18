import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608070033_diagnosis_first_service_catalogue.sql");
const templates = await read("lib/automotive-service-catalogue.ts");
const manager = await read("app/workshop-manager/services/ServiceCatalogueClient.tsx");
const publicPage = await read("app/workshops/[workshopId]/page.tsx");
const request = await read("app/workshops/[workshopId]/request/ServiceRequestFlow.tsx");
const action = await read("app/workshops/[workshopId]/request/actions.ts");

test("standard catalogue covers every supplied vehicle class and representative service group", () => {
  for (const type of ["car_van", "electric_vehicle", "motorcycle_scooter", "electric_bicycle", "electric_kick_scooter"]) {
    assert.match(templates, new RegExp(`${type}:\\s*\\{`));
  }
  for (const service of ["Warning light or fault-code diagnostics", "Seasonal tyre change", "CVT inspection or service", "High-voltage battery health and state-of-health check", "Battery-management-system diagnosis"]) {
    assert.ok(templates.includes(service), service);
  }
  assert.match(manager, /standard-service-options/);
  assert.match(manager, /standardServiceTemplates/);
  assert.doesNotMatch(templates.match(/car_van:\s*\{([\s\S]*?)\n  \},\n  electric_vehicle:/)?.[1] ?? "", /Electric and hybrid vehicles/);
  assert.match(templates, /electric_vehicle:\s*\{[\s\S]+High-voltage battery health and state-of-health check/);
});

test("every workshop starts with an unpublished diagnosis that requires a positive fee", () => {
  assert.match(migration, /insert into public\.workshop_services[\s\S]+?'diagnosis'[\s\S]+?'Diagnosis'/i);
  assert.match(migration, /workshop_profiles_ensure_initial_diagnosis/i);
  assert.match(migration, /service_code is distinct from 'diagnosis'[\s\S]+?price_from_cents is not null and price_from_cents > 0/i);
  assert.match(migration, /'diagnosis', false, 0/i);
  assert.match(manager, /diagnosisFeeHelp/);
});

test("fault work discloses and acknowledges diagnosis while routine services stay direct", () => {
  assert.match(migration, /'diagnosis_first'[\s\S]+?'direct'/i);
  assert.match(migration, /service\.booking_mode <> 'diagnosis_first'[\s\S]+?diagnosis\.price_from_cents is not null/i);
  assert.match(publicPage, /Diagnosis first:/);
  assert.match(publicPage, /Direct service/);
  assert.match(request, /diagnosisAccepted/);
  assert.match(request, /remains payable if I decline further repair work/);
  assert.match(action, /service\.bookingMode !== "direct"[\s\S]+?diagnosisAccepted !== "yes"/);
});
