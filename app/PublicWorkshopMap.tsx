"use client";

import { importLibrary } from "@googlemaps/js-api-loader";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicWorkshop } from "@/lib/dal/public-workshops";
import {
  configureGoogleMapsLoader,
  googleMapsApiKey,
  googleMapsMapId,
} from "@/lib/google-maps-loader";

const ROMANIA_CENTER = { lat: 45.9432, lng: 24.9668 };

function workshopPreview(workshop: PublicWorkshop, preferredDate: string) {
  const preview = document.createElement("article");
  preview.className = "map-workshop-popup";

  const eyebrow = document.createElement("small");
  eyebrow.textContent = "Published workshop";

  const name = document.createElement("strong");
  name.textContent = workshop.name;

  const address = document.createElement("span");
  address.textContent = [workshop.address, workshop.city].filter(Boolean).join(", ");

  const link = document.createElement("a");
  link.href = `/workshops/${workshop.slug}?date=${encodeURIComponent(preferredDate)}`;
  link.textContent = "View workshop";

  preview.append(eyebrow, name, address, link);
  return preview;
}

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
  const infoWindow = useRef<google.maps.InfoWindow | null>(null);
  const markers = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const locatedWorkshops = useMemo(
    () => workshops.filter((workshop) => workshop.latitude != null && workshop.longitude != null),
    [workshops],
  );

  useEffect(() => {
    if (!apiKey || !canvas.current) return;
    let active = true;
    async function initialize() {
      try {
        configureGoogleMapsLoader(apiKey);
        const { InfoWindow, Map } = await importLibrary("maps") as google.maps.MapsLibrary;
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
        infoWindow.current = new InfoWindow({
          maxWidth: 280,
        });
        map.current.addListener("click", () => infoWindow.current?.close());
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
      infoWindow.current?.close();
      infoWindow.current = null;
      map.current = null;
    };
  }, [apiKey]);

  useEffect(() => {
    if (!ready || !map.current) return;
    infoWindow.current?.close();
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
      marker.addListener("click", () => {
        if (!map.current || !infoWindow.current) return;
        infoWindow.current.setContent(workshopPreview(workshop, preferredDate));
        infoWindow.current.open({
          map: map.current,
          anchor: marker,
          shouldFocus: false,
        });
      });
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
  }, [locatedWorkshops, preferredDate, ready]);

  const unavailable = !apiKey || failed;
  return <section className="home-map" aria-label="Published workshop locations">
    {unavailable ? <div className="home-map-canvas" aria-hidden="true" /> : <div ref={canvas} className="google-map-canvas" />}
    {!unavailable && !ready && <div className="map-empty">Loading workshop map…</div>}
    {unavailable && <div className="map-empty">Google Maps is unavailable. Published workshops remain listed below.</div>}
    {ready && !locatedWorkshops.length && <div className="map-empty">No workshops match these filters.</div>}
    <span className="map-attribution">Published Pitster workshop locations</span>
  </section>;
}
