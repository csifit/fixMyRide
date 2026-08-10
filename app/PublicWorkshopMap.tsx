"use client";

import { importLibrary } from "@googlemaps/js-api-loader";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicWorkshop } from "@/lib/dal/public-workshops";
import {
  configureGoogleMapsLoader,
  googleMapsApiKey,
  googleMapsMapId,
} from "@/lib/google-maps-loader";

const ROMANIA_CENTER = { lat: 45.9432, lng: 24.9668 };

export default function PublicWorkshopMap({
  workshops,
  preferredDate,
}: {
  workshops: PublicWorkshop[];
  preferredDate: string;
}) {
  const apiKey = googleMapsApiKey();
  const canvas = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const locatedWorkshops = useMemo(
    () => workshops.filter((workshop) => workshop.latitude != null && workshop.longitude != null),
    [workshops],
  );
  const selected = workshops.find((workshop) => workshop.id === selectedId) ?? null;

  useEffect(() => {
    if (!apiKey || !canvas.current) return;
    let active = true;
    async function initialize() {
      try {
        configureGoogleMapsLoader(apiKey);
        const { Map } = await importLibrary("maps") as google.maps.MapsLibrary;
        await importLibrary("marker");
        if (!active || !canvas.current) return;
        map.current = new Map(canvas.current, {
          center: ROMANIA_CENTER,
          zoom: 6,
          mapId: googleMapsMapId(),
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
        });
        setReady(true);
      } catch {
        if (active) setFailed(true);
      }
    }
    void initialize();
    return () => {
      active = false;
      markers.current.forEach((marker) => { marker.map = null; });
      markers.current = [];
      map.current = null;
    };
  }, [apiKey]);

  useEffect(() => {
    if (!ready || !map.current) return;
    markers.current.forEach((marker) => { marker.map = null; });
    markers.current = [];
    const bounds = new google.maps.LatLngBounds();
    for (const workshop of locatedWorkshops) {
      const position = { lat: workshop.latitude!, lng: workshop.longitude! };
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "workshop-map-pin";
      pin.textContent = workshop.name.slice(0, 1).toUpperCase();
      pin.setAttribute("aria-label", `View ${workshop.name}`);
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: map.current,
        position,
        title: workshop.name,
        content: pin,
      });
      marker.addListener("click", () => setSelectedId(workshop.id));
      markers.current.push(marker);
      bounds.extend(position);
    }
    if (locatedWorkshops.length === 1) {
      map.current.setCenter(bounds.getCenter());
      map.current.setZoom(13);
    } else if (locatedWorkshops.length > 1) {
      map.current.fitBounds(bounds, 56);
    } else {
      map.current.setCenter(ROMANIA_CENTER);
      map.current.setZoom(6);
    }
  }, [locatedWorkshops, ready]);

  const unavailable = !apiKey || failed;
  return <section className="home-map" aria-label="Published workshop locations">
    {unavailable ? <div className="home-map-canvas" aria-hidden="true" /> : <div ref={canvas} className="google-map-canvas" />}
    {!unavailable && !ready && <div className="map-empty">Loading workshop map…</div>}
    {unavailable && <div className="map-empty">Google Maps is unavailable. Published workshops remain listed below.</div>}
    {ready && !locatedWorkshops.length && <div className="map-empty">No workshops match these filters.</div>}
    {selected && <article className="map-workshop-preview">
      <button type="button" onClick={() => setSelectedId(null)} aria-label="Close workshop preview">×</button>
      <small>Published workshop</small>
      <strong>{selected.name}</strong>
      <span>{[selected.address, selected.city].filter(Boolean).join(", ")}</span>
      <Link href={`/workshops/${selected.id}?date=${encodeURIComponent(preferredDate)}`}>View workshop</Link>
    </article>}
    <span className="map-attribution">Published Pitster workshop locations</span>
  </section>;
}
