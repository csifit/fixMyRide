"use client";

import { importLibrary } from "@googlemaps/js-api-loader";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Language } from "@/app/i18n";
import {
  configureGoogleMapsLoader,
  googleMapsApiKey,
  googleMapsMapId,
} from "@/lib/google-maps-loader";

export type GoogleAddressSelection = {
  address: string;
  city: string;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
};

type FieldNames = {
  address: string;
  city: string;
  countryCode: string;
  latitude: string;
  longitude: string;
};

type ManualPinLabels = {
  searchMode: string;
  pinMode: string;
  mapLabel: string;
  mapHelp: string;
  latitude: string;
  longitude: string;
  address: string;
  city: string;
  country: string;
};

const defaultNames: FieldNames = {
  address: "address",
  city: "city",
  countryCode: "countryCode",
  latitude: "latitude",
  longitude: "longitude",
};

function componentValue(
  components: google.maps.places.AddressComponent[] | null | undefined,
  types: string[],
  short = false,
) {
  const component = components?.find((item) => item.types.some((type) => types.includes(type)));
  return component ? (short ? component.shortText : component.longText) ?? "" : "";
}

function geocoderComponentValue(
  components: google.maps.GeocoderAddressComponent[] | null | undefined,
  types: string[],
  short = false,
) {
  const component = components?.find((item) => item.types.some((type) => types.includes(type)));
  return component ? (short ? component.short_name : component.long_name) ?? "" : "";
}

function hasCompleteLocation(value: GoogleAddressSelection) {
  return Boolean(
    value.address.trim()
    && value.city.trim()
    && /^[A-Za-z]{2}$/.test(value.countryCode)
    && value.latitude !== null
    && Number.isFinite(value.latitude)
    && value.latitude >= -90
    && value.latitude <= 90
    && value.longitude !== null
    && Number.isFinite(value.longitude)
    && value.longitude >= -180
    && value.longitude <= 180,
  );
}

export default function GoogleAddressSearch({
  label,
  placeholder,
  help,
  unavailable,
  language,
  initialAddress = "",
  initialCity = "",
  initialCountryCode = "RO",
  initialLatitude = null,
  initialLongitude = null,
  fieldNames = defaultNames,
  formFields = true,
  disabled = false,
  className = "",
  allowManualPin = false,
  manualPinLabels,
  onSelection,
  onTextChange,
}: {
  label: string;
  placeholder: string;
  help: string;
  unavailable: string;
  language: Language;
  initialAddress?: string;
  initialCity?: string;
  initialCountryCode?: string;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  fieldNames?: FieldNames;
  formFields?: boolean;
  disabled?: boolean;
  className?: string;
  allowManualPin?: boolean;
  manualPinLabels?: ManualPinLabels;
  onSelection?: (selection: GoogleAddressSelection | null) => void;
  onTextChange?: (value: string) => void;
}) {
  const apiKey = googleMapsApiKey();
  const host = useRef<HTMLDivElement>(null);
  const addressField = useRef<HTMLInputElement>(null);
  const cityField = useRef<HTMLInputElement>(null);
  const countryField = useRef<HTMLInputElement>(null);
  const latitudeField = useRef<HTMLInputElement>(null);
  const longitudeField = useRef<HTMLInputElement>(null);
  const manualMapHost = useRef<HTMLDivElement>(null);
  const manualMap = useRef<google.maps.Map | null>(null);
  const manualMarker = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const selectionCallback = useRef(onSelection);
  const textCallback = useRef(onTextChange);
  const initialValue: GoogleAddressSelection = {
    address: initialAddress,
    city: initialCity,
    countryCode: initialCountryCode,
    latitude: initialLatitude,
    longitude: initialLongitude,
  };
  const [value, setValue] = useState(initialValue);
  const valueRef = useRef(initialValue);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [manualMapFailed, setManualMapFailed] = useState(false);
  const [mode, setMode] = useState<"search" | "manual">("search");

  useEffect(() => { selectionCallback.current = onSelection; }, [onSelection]);
  useEffect(() => { textCallback.current = onTextChange; }, [onTextChange]);

  const commit = useCallback((next: GoogleAddressSelection, selected: boolean) => {
    valueRef.current = next;
    if (addressField.current) addressField.current.value = next.address;
    if (cityField.current) cityField.current.value = next.city;
    if (countryField.current) countryField.current.value = next.countryCode;
    if (latitudeField.current) latitudeField.current.value = next.latitude?.toString() ?? "";
    if (longitudeField.current) longitudeField.current.value = next.longitude?.toString() ?? "";
    setValue(next);
    textCallback.current?.(next.address);
    selectionCallback.current?.(selected ? next : null);
  }, []);

  const commitManual = useCallback((next: GoogleAddressSelection) => {
    commit(next, hasCompleteLocation(next));
    if (next.latitude === null || next.longitude === null || !manualMarker.current) return;
    const position = { lat: next.latitude, lng: next.longitude };
    manualMarker.current.position = position;
    if (manualMap.current) {
      manualMarker.current.map = manualMap.current;
      manualMap.current.panTo(position);
    }
  }, [commit]);

  function updateCoordinate(field: "latitude" | "longitude", raw: string) {
    const parsed = raw.trim() === "" ? null : Number(raw);
    commitManual({
      ...valueRef.current,
      [field]: parsed !== null && Number.isFinite(parsed) ? parsed : null,
    });
  }

  useEffect(() => {
    if (mode !== "search" || !apiKey || !host.current) return;
    let active = true;
    let autocomplete: google.maps.places.PlaceAutocompleteElement | null = null;
    let containingForm: HTMLFormElement | null = null;
    const syncTypedAddress = () => {
      const typedAddress = autocomplete?.value.trim() ?? "";
      if (!typedAddress || typedAddress === valueRef.current.address) return;
      commit({
        ...valueRef.current,
        address: typedAddress,
        city: "",
        latitude: null,
        longitude: null,
      }, false);
    };
    const syncFormData = (event: FormDataEvent) => {
      syncTypedAddress();
      event.formData.set(fieldNames.address, valueRef.current.address);
      event.formData.set(fieldNames.city, valueRef.current.city);
      event.formData.set(fieldNames.countryCode, valueRef.current.countryCode);
      event.formData.set(fieldNames.latitude, valueRef.current.latitude?.toString() ?? "");
      event.formData.set(fieldNames.longitude, valueRef.current.longitude?.toString() ?? "");
    };
    async function initialize() {
      try {
        configureGoogleMapsLoader(apiKey);
        const { PlaceAutocompleteElement } = await importLibrary("places") as google.maps.PlacesLibrary;
        if (!active || !host.current) return;
        autocomplete = new PlaceAutocompleteElement({
          value: valueRef.current.address,
          placeholder,
          requestedLanguage: language,
          requestedRegion: valueRef.current.countryCode.toLowerCase() || "ro",
        });
        autocomplete.disabled = disabled;
        autocomplete.className = "google-address-element";
        autocomplete.addEventListener("input", () => {
          if (!autocomplete) return;
          commit({
            address: autocomplete.value,
            city: "",
            countryCode: valueRef.current.countryCode || "RO",
            latitude: null,
            longitude: null,
          }, false);
        });
        autocomplete.addEventListener("gmp-select", async (event) => {
          const place = event.placePrediction.toPlace();
          await place.fetchFields({ fields: ["formattedAddress", "location", "addressComponents"] });
          const address = place.formattedAddress;
          const location = place.location;
          const addressComponents = place.addressComponents;
          if (!active || !address || !location) return;
          const city = componentValue(addressComponents, [
            "locality", "postal_town", "administrative_area_level_2", "administrative_area_level_1",
          ]);
          const countryCode = componentValue(addressComponents, ["country"], true).toUpperCase();
          commit({
            address,
            city,
            countryCode: countryCode || valueRef.current.countryCode || "RO",
            latitude: location.lat(),
            longitude: location.lng(),
          }, true);
        });
        autocomplete.addEventListener("gmp-error", () => setFailed(true));
        host.current.replaceChildren(autocomplete);
        containingForm = host.current.closest("form");
        containingForm?.addEventListener("submit", syncTypedAddress, true);
        containingForm?.addEventListener("formdata", syncFormData);
        setReady(true);
        setFailed(false);
      } catch {
        if (active) setFailed(true);
      }
    }
    void initialize();
    return () => {
      active = false;
      containingForm?.removeEventListener("submit", syncTypedAddress, true);
      containingForm?.removeEventListener("formdata", syncFormData);
      autocomplete?.remove();
    };
  }, [apiKey, commit, disabled, fieldNames, language, mode, placeholder]);

  useEffect(() => {
    if (mode !== "manual" || !allowManualPin || !apiKey || !manualMapHost.current) return;
    let active = true;
    let marker: google.maps.marker.AdvancedMarkerElement | null = null;
    const listeners: google.maps.MapsEventListener[] = [];
    let reverseGeocodeSequence = 0;

    async function initializeManualMap() {
      try {
        configureGoogleMapsLoader(apiKey);
        const [{ Map }, { AdvancedMarkerElement }, { Geocoder }] = await Promise.all([
          importLibrary("maps") as Promise<google.maps.MapsLibrary>,
          importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
          importLibrary("geocoding") as Promise<google.maps.GeocodingLibrary>,
        ]);
        if (!active || !manualMapHost.current) return;
        const current = valueRef.current;
        const hasCoordinates = current.latitude !== null && current.longitude !== null;
        const initialPosition = hasCoordinates
          ? { lat: current.latitude as number, lng: current.longitude as number }
          : { lat: 46.0, lng: 25.0 };
        const map = new Map(manualMapHost.current, {
          center: initialPosition,
          zoom: hasCoordinates ? 17 : 7,
          mapId: googleMapsMapId(),
          streetViewControl: false,
          mapTypeControl: true,
          fullscreenControl: false,
        });
        marker = new AdvancedMarkerElement({
          map: hasCoordinates ? map : null,
          position: hasCoordinates ? initialPosition : null,
          gmpDraggable: !disabled,
          title: manualPinLabels?.mapLabel ?? label,
        });
        const geocoder = new Geocoder();
        manualMap.current = map;
        manualMarker.current = marker;
        setManualMapFailed(false);

        async function placePin(position: google.maps.LatLngLiteral) {
          if (!active || !marker) return;
          marker.position = position;
          marker.map = map;
          commitManual({
            ...valueRef.current,
            latitude: position.lat,
            longitude: position.lng,
          });
          const requestSequence = ++reverseGeocodeSequence;
          try {
            const response = await geocoder.geocode({
              location: position,
              language,
              region: valueRef.current.countryCode || "RO",
            });
            if (!active || requestSequence !== reverseGeocodeSequence) return;
            const result = response.results[0];
            if (!result) return;
            const city = geocoderComponentValue(result.address_components, [
              "locality", "postal_town", "administrative_area_level_2", "administrative_area_level_1",
            ]);
            const countryCode = geocoderComponentValue(result.address_components, ["country"], true).toUpperCase();
            commitManual({
              ...valueRef.current,
              address: result.formatted_address || valueRef.current.address,
              city: city || valueRef.current.city,
              countryCode: countryCode || valueRef.current.countryCode || "RO",
              latitude: position.lat,
              longitude: position.lng,
            });
          } catch {
            // Coordinates remain authoritative when Google has no nearby address.
          }
        }

        listeners.push(map.addListener("click", (event: google.maps.MapMouseEvent) => {
          if (disabled || !event.latLng) return;
          void placePin({ lat: event.latLng.lat(), lng: event.latLng.lng() });
        }));
        listeners.push(marker.addListener("dragend", () => {
          if (!marker?.position) return;
          const position = marker.position;
          const lat = typeof position.lat === "function" ? position.lat() : position.lat;
          const lng = typeof position.lng === "function" ? position.lng() : position.lng;
          if (typeof lat === "number" && typeof lng === "number") void placePin({ lat, lng });
        }));
      } catch {
        if (active) setManualMapFailed(true);
      }
    }

    void initializeManualMap();
    return () => {
      active = false;
      listeners.forEach((listener) => listener.remove());
      if (marker) marker.map = null;
      manualMap.current = null;
      manualMarker.current = null;
    };
  }, [allowManualPin, apiKey, commitManual, disabled, label, language, manualPinLabels?.mapLabel, mode]);

  const fallback = !apiKey || failed;
  const pinLabels = manualPinLabels ?? {
    searchMode: "Search address",
    pinMode: "Place pin manually",
    mapLabel: "Exact workshop location",
    mapHelp: "Click the map or drag the pin. You can also enter decimal coordinates.",
    latitude: "Latitude",
    longitude: "Longitude",
    address: "Public address or access directions",
    city: "City or nearest locality",
    country: "Country",
  };
  return <div className={`google-address-search ${className}`.trim()}>
    <span className="google-address-label">{label}</span>
    {allowManualPin && <div className="google-location-mode" role="group" aria-label={label}>
      <button type="button" className={mode === "search" ? "active" : ""} aria-pressed={mode === "search"} disabled={disabled} onClick={() => setMode("search")}>{pinLabels.searchMode}</button>
      <button type="button" className={mode === "manual" ? "active" : ""} aria-pressed={mode === "manual"} disabled={disabled} onClick={() => setMode("manual")}>{pinLabels.pinMode}</button>
    </div>}
    {mode === "search" ? <>
      {fallback ? <div className="google-address-fallback">
        <input value={value.address} disabled={disabled} maxLength={240} placeholder={placeholder} onChange={(event) => commit({ ...valueRef.current, address: event.target.value, city: "", latitude: null, longitude: null }, false)} />
        {formFields && <div><input value={value.city} disabled={disabled} maxLength={120} aria-label={pinLabels.city} onChange={(event) => commit({ ...valueRef.current, city: event.target.value, latitude: null, longitude: null }, false)} /><input value={value.countryCode} disabled={disabled} maxLength={2} aria-label={pinLabels.country} onChange={(event) => commit({ ...valueRef.current, countryCode: event.target.value.toUpperCase(), latitude: null, longitude: null }, false)} /></div>}
      </div> : <div ref={host} className="google-address-host" aria-busy={!ready} />}
      <small>{fallback ? unavailable : help}</small>
    </> : <div className="google-manual-location">
      <div className="google-manual-map-wrap">
        <div ref={manualMapHost} className="google-manual-map" aria-label={pinLabels.mapLabel} />
        {(!apiKey || manualMapFailed) && <p>{unavailable}</p>}
      </div>
      <div className="google-coordinate-grid">
        <label>{pinLabels.latitude}<input type="number" inputMode="decimal" min={-90} max={90} step="any" value={value.latitude ?? ""} disabled={disabled} onChange={(event) => updateCoordinate("latitude", event.target.value)} /></label>
        <label>{pinLabels.longitude}<input type="number" inputMode="decimal" min={-180} max={180} step="any" value={value.longitude ?? ""} disabled={disabled} onChange={(event) => updateCoordinate("longitude", event.target.value)} /></label>
      </div>
      <div className="google-manual-address">
        <label>{pinLabels.address}<input value={value.address} disabled={disabled} required maxLength={240} placeholder={placeholder} onChange={(event) => commitManual({ ...valueRef.current, address: event.target.value })} /></label>
        <label>{pinLabels.city}<input value={value.city} disabled={disabled} required maxLength={120} onChange={(event) => commitManual({ ...valueRef.current, city: event.target.value })} /></label>
        <label>{pinLabels.country}<input value={value.countryCode} disabled={disabled} required pattern="[A-Za-z]{2}" maxLength={2} onChange={(event) => commitManual({ ...valueRef.current, countryCode: event.target.value.toUpperCase() })} /></label>
      </div>
      <small>{pinLabels.mapHelp}</small>
    </div>}
    {formFields && <>
      <input ref={addressField} type="hidden" name={fieldNames.address} defaultValue={value.address} />
      <input ref={cityField} type="hidden" name={fieldNames.city} defaultValue={value.city} />
      <input ref={countryField} type="hidden" name={fieldNames.countryCode} defaultValue={value.countryCode} />
      <input ref={latitudeField} type="hidden" name={fieldNames.latitude} defaultValue={value.latitude ?? ""} />
      <input ref={longitudeField} type="hidden" name={fieldNames.longitude} defaultValue={value.longitude ?? ""} />
    </>}
  </div>;
}
