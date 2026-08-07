import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const migration = await read("supabase/migrations/202608080034_workshop_calendar_manual_appointments.sql");
const calendar = await read("app/workshop-manager/requests/WorkshopBookingCalendar.tsx");
const inbox = await read("app/workshop-manager/requests/WorkshopBookingInboxClient.tsx");
const action = await read("app/workshop-manager/requests/actions.ts");
const sidebar = await read("app/RoleWorkspaceShell.tsx");
const admin = await read("app/admin/AdminDashboardClient.tsx");
const styles = await read("app/globals.css");
const english = JSON.parse(await read("app/i18n/en.json"));

test("manual workshop appointments are authorized, confirmed, and audited", () => {
  assert.match(migration, /create function public\.create_managed_service_appointment/i);
  assert.match(migration, /private\.can_manage_automotive_workshop\(canonical_workshop_id\)/i);
  assert.match(migration, /requested_source not in \('manager_phone', 'manager_walk_in', 'manager_other'\)/i);
  assert.match(migration, /requested_start, requested_start[\s\S]+?'confirmed'/i);
  assert.match(migration, /'manager_created'[\s\S]+?actor_workshop_manager_id/i);
  assert.match(migration, /revoke all on function public\.create_managed_service_appointment[\s\S]+?grant execute/i);
  assert.match(action, /customerPhone:[\s\S]+?\.min\(7\)\.max\(40\)/);
});

test("workshop calendar provides agenda, daily, weekly, and monthly views", () => {
  assert.match(calendar, /type CalendarView = "agenda" \| "day" \| "week" \| "month"/);
  assert.match(calendar, /\["agenda", "day", "week", "month"\]/);
  assert.match(calendar, /setSelectedId\(booking\.id\)/);
  assert.match(calendar, /calendar-details/);
  for (const status of ["requested", "proposed", "confirmed", "rescheduled", "in_service", "completed", "cancelled"]) {
    assert.ok(calendar.includes(`"${status}"`), status);
    assert.ok(styles.includes(`status-${status}`), status);
  }
  assert.match(inbox, /<WorkshopBookingCalendar/);
});

test("manager form uses Customer states and supports phone and walk-in sources", () => {
  assert.equal(english["workshopBookings.customerStates"], "Customer states");
  assert.match(calendar, /name="customerStates"/);
  assert.match(calendar, /value="manager_phone"/);
  assert.match(calendar, /value="manager_walk_in"/);
  assert.match(calendar, /createManualAppointmentAction/);
});

test("each active role workspace has persistent collapsible navigation", () => {
  for (const role of ["customer", "workshop_manager", "workshop_staff", "service_provider"]) {
    assert.ok(sidebar.includes(`${role}:`), role);
    assert.ok(sidebar.includes(`pitster.sidebar.${"${role}"}`) || sidebar.includes("pitster.sidebar.${role}"));
  }
  assert.match(sidebar, /localStorage\.setItem/);
  assert.match(sidebar, /sidebar-collapsed/);
  assert.match(sidebar, /matchMedia\("\(max-width: 760px\)"\)/);
  assert.match(admin, /const \[collapsed, setCollapsed\]/);
  assert.match(admin, /admin-navigation-collapsed/);
  assert.match(admin, /pitster\.sidebar\.admin/);
});
