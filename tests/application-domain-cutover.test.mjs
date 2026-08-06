import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const access = await read("lib/dal/platform-access.ts");
const registration = await read("app/register/actions.ts");
const registrationMigration = await read("supabase/migrations/202608060028_canonical_automotive_registration.sql");
const customerBookings = await read("app/customer/bookings/page.tsx");
const managerRequests = await read("app/workshop-manager/requests/page.tsx");
const home = await read("app/HomeDiscoveryClient.tsx");
const proxy = await read("proxy.ts");

test("active customer and manager pages use canonical access states", () => {
  assert.match(access, /getCustomerAccess/);
  assert.match(access, /getWorkshopManagerAccess/);
  assert.match(access, /target_account_type/);
  assert.match(access, /customer_profiles/);
  assert.match(access, /workshop_manager_profiles/);
  assert.doesNotMatch(customerBookings, /patient/i);
  assert.doesNotMatch(managerRequests, /clinic.manager|clinic_manager/i);
});

test("public registration emits canonical automotive roles", () => {
  assert.match(registration, /"customer" \| "workshop_manager"/);
  assert.doesNotMatch(registration, /registrationType: z\.literal\("patient"\)/);
  assert.match(registrationMigration, /registration_type not in \('customer', 'workshop_manager'\)/i);
  assert.match(registrationMigration, /insert into public\.customer_profiles/i);
  assert.match(registrationMigration, /service_provider_legal_name/i);
});

test("active navigation and middleware use canonical routes", () => {
  assert.match(home, /\/customer\/login/);
  assert.match(home, /\/workshop-manager\/login/);
  assert.doesNotMatch(home, /\/patient\/login|\/clinic-manager/);
  for (const route of ["/customer/:path*", "/workshop-manager/:path*", "/service-provider/:path*", "/workshop-staff/:path*"]) {
    assert.ok(proxy.includes(route), route);
  }
});

test("legacy entry routes are one-release redirects", async () => {
  const redirects = [
    ["app/patient/page.tsx", "/customer"],
    ["app/patient/login/page.tsx", "/customer/login"],
    ["app/clinic-manager/page.tsx", "/workshop-manager"],
    ["app/clinic-manager/login/page.tsx", "/workshop-manager/login"],
    ["app/doctor/page.tsx", "/service-provider"],
    ["app/staff/page.tsx", "/workshop-staff"],
    ["app/appointments/page.tsx", "/bookings"],
  ];
  for (const [path, destination] of redirects) {
    const source = await read(path);
    assert.match(source, /redirect\(/, path);
    assert.ok(source.includes(destination), `${path} -> ${destination}`);
  }
});
