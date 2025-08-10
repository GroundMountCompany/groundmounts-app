"use client";

import { useEffect, useRef } from "react";
import type mapboxgl from "mapbox-gl";

type Props = {
  /** [lng, lat] */
  center: [number, number];
  /** 0–100 (defaults to 50%) */
  zoomPercent?: number;
  /** Optional height/width classes */
  className?: string;
};

function zoomFromPercent(p: number, min = 2, max = 22) {
  const clamped = Math.max(0, Math.min(100, p));
  return min + (max - min) * (clamped / 100);
}

export default function MapPreviewBare({
  center,
  zoomPercent = 50,
  className = "h-[36vh] md:h-72 w-full rounded-xl border border-neutral-200 overflow-hidden",
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let map: mapboxgl.Map | null = null;
    let marker: mapboxgl.Marker | null = null;
    let disposed = false;

    (async () => {
      // Dynamically import to avoid SSR issues
      const mod = await import("mapbox-gl");
      const mapboxgl = mod.default;

      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
      if (!ref.current || !token || disposed) return;

      mapboxgl.accessToken = token;

      map = new mapboxgl.Map({
        container: ref.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center,
        zoom: zoomFromPercent(zoomPercent),
        attributionControl: false,
      });

      // Read-only: allow pan/zoom for context, but marker is fixed
      marker = new mapboxgl.Marker({ color: "#f59e0b" }) // amber
        .setLngLat(center)
        .addTo(map);
    })();

    return () => {
      disposed = true;
      try { marker?.remove?.(); } catch {}
      try { map?.remove?.(); } catch {}
    };
  }, [center[0], center[1], zoomPercent]);

  // If there is no token at runtime, show a graceful placeholder
  const hasToken = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  return (
    <div className={className}>
      {hasToken ? (
        <div ref={ref} className="h-full w-full" />
      ) : (
        <div className="grid h-full w-full place-items-center text-sm text-neutral-500">
          Map unavailable (missing Mapbox token)
        </div>
      )}
    </div>
  );
}