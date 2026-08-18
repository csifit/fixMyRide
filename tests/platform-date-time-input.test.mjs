import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const picker = await read("app/PlatformDateTimeInput.tsx");
const styles = await read("app/globals.css");
const automotiveInputs = await Promise.all([
  "app/HomeDiscoveryClient.tsx",
  "app/workshops/[workshopId]/page.tsx",
  "app/workshops/[workshopId]/request/ServiceRequestFlow.tsx",
  "app/workshop-manager/requests/WorkshopBookingCalendar.tsx",
  "app/workshop-manager/requests/WorkshopBookingInboxClient.tsx",
  "app/workshop-manager/requests/WorkshopCapacityControls.tsx",
  "app/workshop-manager/workshops/WorkshopOperationsClient.tsx",
  "app/workshop-manager/quality/WorkshopQualityClient.tsx",
  "app/workshop-manager/repairs/VehicleServiceRecordForm.tsx",
].map(read));

test("automotive date and time fields use the localized platform picker", () => {
  assert.match(picker, /role="dialog"/);
  assert.match(picker, /locales\[language\]/);
  assert.match(picker, /platform-calendar-days/);
  assert.match(picker, /platform-time-fields/);
  for (const source of automotiveInputs) {
    assert.doesNotMatch(source, /type="(?:date|datetime-local|time)"/);
  }
});

test("calendar typography is readable and regular weight", () => {
  assert.match(styles, /\.platform-date-time-input \{[^}]*font-size:11px;[^}]*font-weight:400/);
  assert.match(styles, /\.platform-calendar-popover>header strong \{[^}]*font-size:13px;[^}]*font-weight:400/);
  assert.doesNotMatch(styles.match(/\.platform-date-time-input[\s\S]*?\n a \{/)?.[0] ?? "", /font-size:[0-9](?:px|;)/);
});
