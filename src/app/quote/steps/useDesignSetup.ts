'use client';

import { useEffect } from 'react';
import { useQuoteStore } from '@/store/quoteStore';
import { mapRef } from '@/store/mapRefs';
import { autoPlaceArray } from '@/lib/geo/place';
import { scheduleAutoPlacement } from '@/lib/geo/placementScheduler';
import { slopeAt } from '@/lib/slope';

/**
 * Everything the design step needs on entry: drop the array somewhere sensible
 * and read the slope once.
 *
 * Lives in a hook rather than inside the step body so the placement survives
 * the step component re-rendering, and so it is obvious this runs exactly once
 * per funnel rather than per paint.
 */
export function useDesignSetup() {
  const meter = useQuoteStore((s) => s.electricalMeterPosition);
  const totalPanels = useQuoteStore((s) => s.totalPanels);
  const panelTier = useQuoteStore((s) => s.panelTier);
  const arrayCenter = useQuoteStore((s) => s.arrayCenter);
  const slopePercent = useQuoteStore((s) => s.slopePercent);
  const mapReady = useQuoteStore((s) => s.mapReady);

  // Drop the array: south-facing, clear of the meter, off the house.
  //
  // Gated on map idle because `building` features only exist once tiles have
  // drawn, but bounded so open country — where no buildings ever appear —
  // still gets an array.
  useEffect(() => {
    if (!mapReady || !meter || totalPanels <= 0 || arrayCenter) return;
    const map = mapRef.current;
    if (!map) return;

    return scheduleAutoPlacement(
      {
        isIdle: () => map.isStyleLoaded() && !map.isMoving(),
        onIdle: (fn) => map.on('idle', fn),
        offIdle: (fn) => map.off('idle', fn),
        queryObstacles: () => {
          if (!map.isStyleLoaded()) return [];
          const canvas = map.getCanvas();
          try {
            return map
              .queryRenderedFeatures(
                [
                  [0, 0],
                  [canvas.clientWidth, canvas.clientHeight],
                ],
                { layers: ['building'] }
              )
              .filter((f) => f.geometry?.type === 'Polygon') as never[];
          } catch {
            // Style has no `building` layer at this zoom.
            return [];
          }
        },
      },
      (obstacles) => {
        if (useQuoteStore.getState().arrayCenter) return;
        const { center } = autoPlaceArray({
          meter,
          panelCount: totalPanels,
          tier: panelTier,
          azimuth: 180,
          obstacles,
        });
        useQuoteStore.getState().setArrayCenter(center);
      }
    );
  }, [mapReady, meter, totalPanels, panelTier, arrayCenter]);

  // Site intel: production curve and soil, fetched once per location. Advisory
  // only — the store already holds the Texas fallback curve and a null soil
  // class, so a failure here never blocks the step.
  useEffect(() => {
    if (!meter) return;
    const [lng, lat] = meter;
    let cancelled = false;

    fetch(`/api/site?lat=${lat}&lng=${lng}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json?.ok) return;
        useQuoteStore.getState().setSiteIntel({
          curve: json.curve,
          curveSource: json.curveSource,
          soilClass: json.soilClass,
        });
      })
      .catch(() => {
        // Keeping the fallback is the correct outcome, so there is nothing to do.
      });

    return () => {
      cancelled = true;
    };
  }, [meter]);

  // First slope read. Later ones are triggered by dragend inside the map.
  useEffect(() => {
    if (!mapReady || !arrayCenter || slopePercent !== null) return;
    let cancelled = false;
    slopeAt(mapRef.current, arrayCenter).then((r) => {
      if (!cancelled) useQuoteStore.getState().setSlope(r.percent, r.tier);
    });
    return () => {
      cancelled = true;
    };
  }, [mapReady, arrayCenter, slopePercent]);
}
