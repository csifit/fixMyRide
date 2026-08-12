import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const page = await read("app/workshops/[workshopId]/page.tsx");
const requestPage = await read("app/workshops/[workshopId]/request/page.tsx");
const locationMap = await read("app/workshops/[workshopId]/WorkshopLocationMap.tsx");
const mapCss = await read("app/workshops/[workshopId]/WorkshopLocationMap.module.css");
const customer = await read("app/customer/bookings/CustomerBookingsClient.tsx");
const css = await read("app/globals.css");
const notifications = await read("supabase/migrations/202608080035_service_booking_lifecycle_notifications.sql");

test("public workshop profiles keep booking, about, and contact in the primary view", () => {
  assert.match(page, /className="workshop-profile-main"/);
  assert.match(page, /workshop-appointment-card/);
  assert.match(page, /workshop-about-card/);
  assert.match(page, /workshop-contact-card/);
  assert.match(page, /Services offered/);
  assert.match(page, /services\.map/);
});

test("booking recommends diagnosis and cannot be opened for an unclaimed listing", () => {
  assert.match(page, /find\(\(service\) => service\.bookingMode === "diagnosis"\)/);
  assert.match(page, /Recommended first step/);
  assert.match(page, /bookingAvailable && recommendedService/);
  assert.match(requestPage, /loadPublicWorkshopClaim/);
  assert.match(requestPage, /claim && claim\.status !== "claimed"/);
});

test("the exact workshop location is rendered in a compact right-side map", () => {
  assert.match(page, /className="workshop-profile-sidebar"/);
  assert.match(page, /WorkshopLocationMap/);
  assert.match(locationMap, /center: position/);
  assert.match(locationMap, /AdvancedMarkerElement/);
  assert.match(locationMap, /destination=\$\{latitude\},\$\{longitude\}/);
  assert.match(mapCss, /aspect-ratio: 1\.618 \/ 1/);
});

test("new profile cards and customer lifecycle use golden-ratio design tokens", () => {
  assert.match(css, /--phi:1\.618/);
  assert.match(css, /--space-f1:8px[\s\S]+--space-f5:55px/);
  assert.match(css, /grid-template-columns:minmax\(0,1\.618fr\) minmax\(280px,1fr\)/);
  assert.match(customer, /RepairLifecycleOverview/);
  assert.match(customer, /customerBookings\.lifecycle\.notifications/);
});

test("customer lifecycle overview preserves the existing notification workflow", () => {
  for (const event of ["booking_confirmed", "reminder_24h", "repair_started", "ready_for_pickup", "review_request"]) {
    assert.match(notifications, new RegExp(event));
  }
  assert.doesNotMatch(customer, /service_booking_notifications|dispatch/i);
});
