import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const migration = await read("supabase/migrations/202608210072_dedicated_workshop_capacity_resources.sql");
const client = await read("app/workshop-manager/capacity/CapacityResourcesClient.tsx");
const actions = await read("app/workshop-manager/capacity/actions.ts");
const managerPage = await read("app/workshop-manager/capacity/page.tsx");
const organisationPage = await read("app/service-organisation/capacity/page.tsx");
const managerRequests = await read("app/workshop-manager/requests/page.tsx");
const organisationRequests = await read("app/service-organisation/requests/page.tsx");
const inbox = await read("app/workshop-manager/requests/WorkshopBookingInboxClient.tsx");
const calendar = await read("app/workshop-manager/requests/WorkshopBookingCalendar.tsx");
const sidebar = await read("app/RoleWorkspaceShell.tsx");
const guidance = await read("app/guidance/content.ts");
const onboarding = await read("app/guidance/ProviderOnboardingChecklist.tsx");
const recommendations = await read("lib/provider-recommendations.ts");
const styles = await read("app/globals.css");

test("capacity storage distinguishes personnel and physical workstations securely", () => {
  assert.match(migration, /resource_category in \('personnel', 'workstation'\)/);
  for (const type of ["mechanic", "electrician", "painter", "bay", "ramp", "lift", "paint_booth"]) {
    assert.match(migration, new RegExp(`'${type}'`));
  }
  assert.match(migration, /create table public\.workshop_personnel_workstation_assignments/);
  assert.match(migration, /alter table public\.workshop_personnel_workstation_assignments enable row level security/);
  assert.match(migration, /revoke all on table public\.workshop_personnel_workstation_assignments/);
  assert.match(migration, /private\.can_manage_automotive_workshop/);
  assert.match(migration, /station\.workshop_id <> personnel\.workshop_id/);
  assert.match(migration, /station\.resource_category <> 'workstation'/);
  assert.match(migration, /on conflict \(personnel_resource_id\) do update/);
  assert.match(migration, /unique \(workshop_id, resource_category, resource_type, display_name\)/);
});

test("dedicated page splits personnel and workstations and supports drag assignment", () => {
  assert.match(client, /capacity-split-layout/);
  assert.match(client, /capacity-personnel-column/);
  assert.match(client, /capacity-workstation-column/);
  assert.match(client, /draggable=\{worker\.active\}/);
  assert.match(client, /application\/x-pitster-personnel/);
  assert.match(client, /onDrop=\{drop\}/);
  assert.match(client, /capacity-station-fallback/);
  assert.match(client, /UnassignedDropzone/);
  assert.match(actions, /assignPersonnelWorkstationAction/);
  assert.match(actions, /setWorkshopDailyCapacity/);
});

test("capacity pages are role-aware and organisations start with location selection", () => {
  assert.match(managerPage, /requireLocationSelection=\{false\}/);
  assert.match(organisationPage, /requireLocationSelection/);
  assert.match(organisationPage, /: null/);
  assert.match(client, /capacity\.selectLocationPrompt/);
  assert.match(sidebar, /\/workshop-manager\/capacity/);
  assert.match(sidebar, /\/service-organisation\/capacity/);
});

test("workshop calendar is location scoped and no longer renders capacity setup", () => {
  assert.match(organisationRequests, /operations\.find\(\(location\) => location\.id === workshopId\) \?\? null/);
  assert.match(organisationRequests, /bookings=\{selected \? bookings\.filter/);
  assert.match(organisationRequests, /required: true/);
  assert.match(managerRequests, /schedules=\{selected \? scheduling\.schedules\.filter/);
  assert.match(inbox, /capacity\.selectCalendarLocation/);
  assert.match(inbox, /canShowCalendar/);
  assert.match(calendar, /capacity\.calendarFor/);
  assert.doesNotMatch(calendar, /<WorkshopCapacityPanel/);
});

test("guidance and recommendations point to the dedicated capacity route", () => {
  assert.match(guidance, /path: "\/workshop-manager\/capacity"/);
  assert.match(guidance, /path: "\/service-organisation\/capacity"/);
  assert.doesNotMatch(guidance, /requests#capacity/);
  assert.match(onboarding, /step === "capacity" \|\| step === "resources"/);
  assert.match(recommendations, /rule === "capacity" \|\| rule === "resources"/);
});

test("dedicated capacity interface remains responsive and readable", () => {
  const capacityCss = styles.slice(styles.indexOf("/* Dedicated workshop capacity and resources */"));
  assert.match(capacityCss, /grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(capacityCss, /@media \(max-width:850px\)/);
  const sizes = [...capacityCss.matchAll(/font-size:\s*([0-9.]+)px/g)]
    .map((match) => Number(match[1]));
  assert.equal(sizes.some((size) => size < 10), false);
  assert.doesNotMatch(capacityCss, /font(?:-weight|):\s*(?:[5-9][0-9]{2}|bold|bolder)/);
});
