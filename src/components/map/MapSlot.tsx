'use client';

import { useEffect, useRef } from 'react';
import { setMapSlot } from './mapStage';

/**
 * Reserves space for the shared map. The real canvas is positioned over this
 * rectangle by <MapStage />; nothing is mounted here.
 */
export default function MapSlot({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMapSlot(ref.current);
    return () => setMapSlot(null);
  }, []);

  return <div ref={ref} data-testid="map-slot" className={className} />;
}
