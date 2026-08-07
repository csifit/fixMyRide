import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608090036_automotive_admin_snapshot.sql");
const dal = await read("lib/dal/admin.ts");
const client = await read("app/admin/AdminDashboardClient.tsx");
const sections = await read("app/admin/[section]/page.tsx");
const actions = await read("app/admin/actions.ts");

test("automotive admin snapshot is MFA protected and reads canonical domain tables", () => {
  assert.match(migration, /private\.is_active_platform_admin\(\)/);
  for (const table of ["service_providers", "workshops", "customer_profiles", "workshop_manager_profiles", "service_booking_requests", "service_booking_notifications"]) {
    assert.ok(migration.includes(`public.${table}`), table);
  }
  assert.doesNotMatch(migration, /public\.(clinicians|patients|clinic_locations|clinic_manager_profiles)\b/);
  assert.match(migration, /revoke all on function public\.get_automotive_admin_snapshot\(\)[\s\S]+?grant execute[\s\S]+?to authenticated/i);
});

test("active admin routes and UI use automotive terminology only", () => {
  assert.match(dal, /get_automotive_admin_snapshot/);
  for (const section of ["providers", "workshops", "customers", "managers", "sms", "security"]) {
    assert.ok(sections.includes(`"${section}"`), section);
    assert.ok(client.includes(`automotiveAdmin.nav.${section}`), section);
  }
  assert.doesNotMatch(client, /doctor|patient|clinic/i);
  assert.doesNotMatch(dal, /clinician|patient|clinic/i);
});

test("medical admin mutations and DAL modules are retired from the active build", async () => {
  assert.doesNotMatch(actions, /Doctor|Patient|Clinic|clinician|patient|clinic/);
  for (const path of ["lib/dal/admin-doctors.ts", "lib/dal/admin-patients.ts", "lib/dal/admin-clinics.ts"]) {
    await assert.rejects(access(new URL(path, root)));
  }
});
