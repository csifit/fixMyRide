import assert from "node:assert/strict";
import { access as fileAccess, readFile } from "node:fs/promises";
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
const css = await read("app/globals.css");
const i18nIndex = await read("app/i18n/index.ts");
const locales = await Promise.all(
  ["en", "de", "ro", "hu"].map(async (locale) =>
    JSON.parse(await read(`app/i18n/${locale}.json`)),
  ),
);

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
  assert.doesNotMatch(proxy, /doctor|clinic-manager|patient|"\/staff/i);
});

test("legacy medical routes and application modules are retired", async () => {
  const retired = [
    "app/patient/page.tsx",
    "app/clinic-manager/page.tsx",
    "app/doctor/page.tsx",
    "app/staff/page.tsx",
    "app/appointments/page.tsx",
    "app/doctors/[doctorId]/page.tsx",
    "app/PatientPortalClient.tsx",
    "app/GoogleDoctorMap.tsx",
    "lib/dal/doctor.ts",
    "lib/dal/public-appointments.ts",
    "lib/sms/appointment-notifications.ts",
  ];
  for (const path of retired) await assert.rejects(fileAccess(new URL(path, root)), path);
});

test("canonical UI assets contain no retired medical namespaces or selectors", async () => {
  const retiredNamespaces = [
    "appointments",
    "availability",
    "doctor",
    "doctorProfile",
    "medical",
    "organization",
    "patient",
    "patientAppointments",
    "staffPatients",
  ];
  for (const dictionary of locales) {
    const keys = Object.keys(dictionary);
    for (const namespace of retiredNamespaces) {
      assert.equal(keys.some((key) => key.startsWith(`${namespace}.`)), false, namespace);
    }
    assert.equal(keys.some((key) => /^admin\.(?:doctor|clinic|patient|audit|section|table|empty|task)\./.test(key)), false);
    assert.deepEqual(keys.filter((key) => key.startsWith("billing.")), ["billing.downloadCsv"]);
  }
  assert.doesNotMatch(i18nIndex, /medicalKey|medical\./);
  await assert.rejects(fileAccess(new URL("app/i18n/admin-values.ts", root)));
  assert.doesNotMatch(
    css,
    /\.(?:doctor(?:-|\b)|patient(?:-|\b)|dp-|staff-patient|admin-(?:doctor|clinic|patient)|health-data-form|critical-diagnoses|sensitive-identifiers|diagnosis-)/,
  );
  assert.match(css, /\.workshop-public-page/);
  assert.match(css, /\.workshop-public-hero/);
});
