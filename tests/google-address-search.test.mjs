import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const addressSearch = await readFile(new URL("app/GoogleAddressSearch.tsx", root), "utf8");
const loader = await readFile(new URL("lib/google-maps-loader.ts", root), "utf8");
const home = await readFile(new URL("app/HomeDiscoveryClient.tsx", root), "utf8");
const catalogs = Object.fromEntries(await Promise.all(["en", "de", "ro", "hu"].map(async (language) => [language, JSON.parse(await readFile(new URL(`app/i18n/${language}.json`, root), "utf8"))])));

test("address entry uses Google Places Autocomplete New with a shared loader", () => {
  assert.match(addressSearch, /importLibrary\("places"\)/);
  assert.match(addressSearch, /new PlaceAutocompleteElement/);
  assert.match(addressSearch, /"gmp-select"/);
  assert.match(addressSearch, /fetchFields\(\{ fields: \["formattedAddress", "location", "addressComponents"\] \}\)/);
  assert.match(loader, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
  assert.match(loader, /authReferrerPolicy: "origin"/);
});

test("coordinates are captured as hidden implementation fields and never requested from users", () => {
  assert.match(addressSearch, /ref=\{latitudeField\} type="hidden" name=\{fieldNames\.latitude\}/);
  assert.match(addressSearch, /ref=\{longitudeField\} type="hidden" name=\{fieldNames\.longitude\}/);
  assert.doesNotMatch(addressSearch, /name="(?:latitude|longitude)" type="number"/);
});

test("typed Google text is synchronized into submitted FormData", () => {
  assert.match(addressSearch, /const syncTypedAddress/);
  assert.match(addressSearch, /autocomplete\?\.value\.trim\(\)/);
  assert.match(addressSearch, /addEventListener\("submit", syncTypedAddress, true\)/);
  assert.match(addressSearch, /addEventListener\("formdata", syncFormData\)/);
  for (const name of ["address", "city", "countryCode", "latitude", "longitude"]) {
    assert.match(addressSearch, new RegExp(`event\\.formData\\.set\\(fieldNames\\.${name}`), name);
  }
});

test("workshop discovery uses Google address proximity search", () => {
  assert.match(home, /<GoogleAddressSearch/);
  assert.match(home, /distanceInKilometers/);
  assert.match(home, /<= 50/);
  assert.doesNotMatch(home, /<select value=\{location\}/);
});

test("keyless and Google error states retain a usable manual address fallback", () => {
  assert.match(addressSearch, /const fallback = !apiKey \|\| failed/);
  assert.match(addressSearch, /google-address-fallback/);
  assert.match(addressSearch, /onChange=\{\(event\) => commit/);
  assert.match(addressSearch, /latitude: null, longitude: null/);
});

test("Google address-search guidance has translation parity", () => {
  const keys = [
    "home.addressSearchPlaceholder", "home.addressSearchHelp", "home.addressSearchFallback",
    "workspace.addressSearchHelp", "workspace.addressSearchFallback",
  ];
  for (const language of ["en", "de", "ro", "hu"]) {
    for (const key of keys) assert.equal(typeof catalogs[language][key], "string", `${language}: ${key}`);
  }
});
