"use client";
import dynamic from "next/dynamic";
import mapboxgl from 'mapbox-gl';

interface Props {
  map: mapboxgl.Map | null;
  mapLoaded: boolean;
  mode?: "default" | "place-meter" | "preview" | "design";
  onPlace?: (lngLat: { lng: number; lat: number }) => void;
}

const Inner = dynamic(() => import("./MapboxSolarPanelInner"), {
  ssr: false,
  loading: () => (
    <div className="h-[60vh] w-full animate-pulse rounded-xl bg-neutral-200" />
  ),
});

export default function MapboxSolarPanel({ map, mapLoaded, mode, onPlace }: Props) {
  return <Inner map={map} mapLoaded={mapLoaded} mode={mode} onPlace={onPlace} />;
}