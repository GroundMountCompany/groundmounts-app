"use client";
import dynamic from "next/dynamic";
import mapboxgl from 'mapbox-gl';

interface Props {
  map: mapboxgl.Map | null;
  mapLoaded: boolean;
  mode?: "default" | "place-meter" | "preview" | "design";
}

const Inner = dynamic(() => import("./MapboxSolarPanelInner"), {
  ssr: false,
  loading: () => (
    <div className="h-[60vh] w-full animate-pulse rounded-xl bg-neutral-200" />
  ),
});

export default function MapboxSolarPanel({ map, mapLoaded, mode }: Props) {
  return <Inner map={map} mapLoaded={mapLoaded} mode={mode} />;
}