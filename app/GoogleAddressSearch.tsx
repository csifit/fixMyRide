"use client";

import { importLibrary } from "@googlemaps/js-api-loader";
import { useEffect, useRef, useState } from "react";
import type { Language } from "@/app/i18n";
import { configureGoogleMapsLoader, googleMapsApiKey } from "@/lib/google-maps-loader";

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

  useEffect(() => { selectionCallback.current = onSelection; }, [onSelection]);
  useEffect(() => { textCallback.current = onTextChange; }, [onTextChange]);

  function commit(next: GoogleAddressSelection, selected: boolean) {
    valueRef.current = next;
    if (addressField.current) addressField.current.value = next.address;
    if (cityField.current) cityField.current.value = next.city;
    if (countryField.current) countryField.current.value = next.countryCode;
    if (latitudeField.current) latitudeField.current.value = next.latitude?.toString() ?? "";
    if (longitudeField.current) longitudeField.current.value = next.longitude?.toString() ?? "";
    setValue(next);
    textCallback.current?.(next.address);
    selectionCallback.current?.(selected ? next : null);
  }

  useEffect(() => {
    if (!apiKey || !host.current) return;
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
  }, [apiKey, disabled, fieldNames, language, placeholder]);

  const fallback = !apiKey || failed;
  return <div className={`google-address-search ${className}`.trim()}>
    <span className="google-address-label">{label}</span>
    {fallback ? <div className="google-address-fallback">
      <input value={value.address} disabled={disabled} maxLength={240} placeholder={placeholder} onChange={(event) => commit({ ...valueRef.current, address: event.target.value, latitude: null, longitude: null }, false)} />
      {formFields && <div><input value={value.city} disabled={disabled} maxLength={120} aria-label="City" onChange={(event) => commit({ ...valueRef.current, city: event.target.value, latitude: null, longitude: null }, false)} /><input value={value.countryCode} disabled={disabled} maxLength={2} aria-label="Country" onChange={(event) => commit({ ...valueRef.current, countryCode: event.target.value.toUpperCase(), latitude: null, longitude: null }, false)} /></div>}
    </div> : <div ref={host} className="google-address-host" aria-busy={!ready} />}
    <small>{fallback ? unavailable : help}</small>
    {formFields && <>
      <input ref={addressField} type="hidden" name={fieldNames.address} defaultValue={value.address} />
      <input ref={cityField} type="hidden" name={fieldNames.city} defaultValue={value.city} />
      <input ref={countryField} type="hidden" name={fieldNames.countryCode} defaultValue={value.countryCode} />
      <input ref={latitudeField} type="hidden" name={fieldNames.latitude} defaultValue={value.latitude ?? ""} />
      <input ref={longitudeField} type="hidden" name={fieldNames.longitude} defaultValue={value.longitude ?? ""} />
    </>}
  </div>;
}
