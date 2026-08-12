"use client";

import { importLibrary } from "@googlemaps/js-api-loader";
import { useEffect, useRef, useState } from "react";
import {
  configureGoogleMapsLoader,
  googleMapsApiKey,
  googleMapsMapId,
} from "@/lib/google-maps-loader";
import styles from "./WorkshopLocationMap.module.css";

export default function WorkshopLocationMap({ name, address, latitude, longitude }: {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(!googleMapsApiKey());

  useEffect(() => {
    if (!canvas.current || !googleMapsApiKey()) return;
    let active = true;
    let marker: google.maps.marker.AdvancedMarkerElement | null = null;
    async function initialize() {
      try {
        configureGoogleMapsLoader();
        const { Map } = await importLibrary("maps") as google.maps.MapsLibrary;
        await importLibrary("marker");
        if (!active || !canvas.current) return;
        const position = { lat: latitude, lng: longitude };
        const map = new Map(canvas.current, {
          center: position,
          zoom: 16,
          mapId: googleMapsMapId(),
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
        });
        const pin = document.createElement("div");
        pin.className = styles.pin;
        const label = document.createElement("span");
        label.textContent = name.slice(0, 1).toUpperCase();
        pin.append(label);
        marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position,
          title: name,
          content: pin,
        });
      } catch {
        if (active) setUnavailable(true);
      }
    }
    void initialize();
    return () => {
      active = false;
      if (marker) marker.map = null;
    };
  }, [latitude, longitude, name]);

  const directions = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  return <section className={styles.card} aria-label={`Exact location of ${name}`}>
    <header className={styles.heading}><h2>Exact location</h2><p>{address}</p></header>
    <div className={styles.map}>
      {!unavailable && <div ref={canvas} className={styles.canvas} />}
      {unavailable && <div className={styles.fallback}>Map preview unavailable. Use directions to open the exact location.</div>}
    </div>
    <a className={styles.directions} href={directions} target="_blank" rel="noreferrer">Open directions</a>
  </section>;
}
