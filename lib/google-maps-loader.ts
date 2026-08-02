import { setOptions } from "@googlemaps/js-api-loader";

let configured = false;

export function googleMapsApiKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
}

export function configureGoogleMapsLoader(apiKey = googleMapsApiKey()) {
  if (!apiKey) return false;
  if (!configured) {
    setOptions({
      key: apiKey,
      v: "weekly",
      region: "RO",
      authReferrerPolicy: "origin",
    });
    configured = true;
  }
  return true;
}
