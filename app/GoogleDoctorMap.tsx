"use client";

import { importLibrary } from "@googlemaps/js-api-loader";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { brand } from "@/lib/brand";
import { configureGoogleMapsLoader, googleMapsApiKey } from "@/lib/google-maps-loader";
import type { PublicDoctor } from "@/lib/dal/public-appointments";

type PinStyle = CSSProperties & {
  "--pin-x": string;
  "--pin-y": string;
};

function previewPinPosition(doctor: PublicDoctor, index: number): PinStyle {
  if (doctor.latitude !== null && doctor.longitude !== null) {
    const x = Math.max(8, Math.min(92, ((doctor.longitude - 20) / 10) * 100));
    const y = Math.max(8, Math.min(92, ((48.3 - doctor.latitude) / 4.8) * 100));
    return { "--pin-x": `${x}%`, "--pin-y": `${y}%` };
  }
  const offsets = [
    [50, 67], [54, 63], [46, 61], [58, 69], [42, 68], [51, 57],
  ];
  const [x, y] = offsets[index % offsets.length];
  return { "--pin-x": `${x}%`, "--pin-y": `${y}%` };
}

export default function GoogleDoctorMap({
  doctors,
  selectedId,
  onSelect,
  labels,
}: {
  doctors: PublicDoctor[];
  selectedId: string | null;
  onSelect: (doctorId: string) => void;
  labels: {
    mapLabel: string;
    noResults: string;
    noPreciseLocations: string;
    previewCoverage: string;
    unavailable: string;
  };
}) {
  const apiKey = googleMapsApiKey();
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() || "DEMO_MAP_ID";
  const mapElement = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const locatedDoctors = useMemo(
    () => doctors.filter(
      (doctor) => doctor.latitude !== null && doctor.longitude !== null,
    ),
    [doctors],
  );

  useEffect(() => {
    if (!apiKey || !mapElement.current) return;
    let active = true;
    const markers: google.maps.marker.AdvancedMarkerElement[] = [];
    async function initialize() {
      try {
        configureGoogleMapsLoader(apiKey);
        const [{ Map }, { AdvancedMarkerElement, PinElement }] = await Promise.all([
          importLibrary("maps") as Promise<google.maps.MapsLibrary>,
          importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
        ]);
        if (!active || !mapElement.current) return;
        const map = new Map(mapElement.current, {
          center: { lat: 45.9432, lng: 24.9668 },
          zoom: 7,
          mapId,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          clickableIcons: false,
        });
        const bounds = new google.maps.LatLngBounds();
        locatedDoctors.forEach((doctor) => {
          const position = {
            lat: doctor.latitude!,
            lng: doctor.longitude!,
          };
          const pin = new PinElement({
            background: doctor.id === selectedId ? "#d99a25" : brand.primaryColor,
            borderColor: "#ffffff",
            glyph: brand.mark,
            glyphColor: "#ffffff",
            scale: doctor.id === selectedId ? 1.2 : 1,
          });
          const marker = new AdvancedMarkerElement({
            map,
            position,
            title: `${doctor.name}, ${doctor.clinicName}`,
            content: pin.element,
          });
          marker.addListener("click", () => onSelectRef.current(doctor.id));
          markers.push(marker);
          bounds.extend(position);
        });
        if (locatedDoctors.length === 1) {
          map.setCenter(bounds.getCenter());
          map.setZoom(13);
        } else if (locatedDoctors.length > 1) {
          map.fitBounds(bounds, 55);
        }
        setLoadFailed(false);
      } catch {
        if (active) setLoadFailed(true);
      }
    }
    void initialize();
    return () => {
      active = false;
      markers.forEach((marker) => {
        marker.map = null;
      });
    };
  }, [apiKey, doctors, locatedDoctors, mapId, selectedId]);

  if (apiKey && !loadFailed) {
    return <div className="google-map-wrap" aria-label={labels.mapLabel}>
      <div ref={mapElement} className="google-map-canvas" />
      {!locatedDoctors.length && <div className="map-empty">{labels.noPreciseLocations}</div>}
    </div>;
  }

  return <div className="home-map-canvas" aria-label={labels.mapLabel}>
    <span className="map-city map-city-cluj">Cluj-Napoca</span>
    <span className="map-city map-city-iasi">Iași</span>
    <span className="map-city map-city-timisoara">Timișoara</span>
    <span className="map-city map-city-bucharest">București</span>
    {doctors.map((doctor, index) => <button
      type="button"
      key={doctor.id}
      className={`doctor-map-pin${selectedId === doctor.id ? " active" : ""}`}
      style={previewPinPosition(doctor, index)}
      onClick={() => onSelect(doctor.id)}
      aria-label={`${doctor.name}, ${doctor.clinicName}`}
    ><span>{brand.mark}</span></button>)}
    {!doctors.length && <div className="map-empty">{labels.noResults}</div>}
    <div className="map-attribution">
      {loadFailed ? labels.unavailable : labels.previewCoverage}
    </div>
  </div>;
}
