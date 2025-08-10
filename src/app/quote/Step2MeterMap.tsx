"use client";

import { useCallback, useState } from "react";
import { useQuoteContext } from "@/contexts/quoteContext";
import MapDrawTool from "./MapDrawTool";

enum QuoteStep {
  Address = 0,
  MeterIntro = 1,
  MeterMap = 2,
  EnergyCalcs = 3,
}

export default function Step2MeterMap() {
  const { setElectricalMeter, setElectricalMeterPosition, setCurrentStepIndex } = useQuoteContext();
  const [hasPlaced, setHasPlaced] = useState(false);

  const handlePlace = useCallback((lngLat: { lng: number; lat: number }) => {
    setElectricalMeter({
      coordinates: {
        latitude: lngLat.lat,
        longitude: lngLat.lng
      },
      distanceInFeet: 0 // Will be calculated later when panels are placed
    });
    setElectricalMeterPosition([lngLat.lng, lngLat.lat]);
    setHasPlaced(true);
  }, [setElectricalMeter, setElectricalMeterPosition]);

  const goNext = useCallback(() => {
    if (!hasPlaced) return;
    setCurrentStepIndex(QuoteStep.EnergyCalcs);
  }, [hasPlaced, setCurrentStepIndex]);

  return (
    <section className="grid h-[100svh] w-full grid-rows-[auto_1fr_auto] overflow-hidden bg-white">
      <div className="border-b border-neutral-200 bg-white/95 px-4 py-3 sm:px-6">
        <h2 className="text-[clamp(14px,2.4vw,18px)] font-semibold text-neutral-900">
          Click Your Electrical Meter on the Map
        </h2>
        <p className="mt-1 text-[clamp(12px,2vw,14px)] text-neutral-600">
          Find your property and click the exact spot where your electrical meter is. You can click again to adjust.
        </p>
      </div>

      <div className="relative">
        <div className="absolute inset-0 pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-0">
          <MapDrawTool 
            mode="place-meter"
            initialZoomPercent={50}
            onPlace={handlePlace}
          />
        </div>
      </div>

      {/* Local sticky Continue */}
      <div className="px-4 pb-[env(safe-area-inset-bottom)] pt-2 sm:px-6">
        <button
          type="button"
          onClick={goNext}
          disabled={!hasPlaced}
          className={`w-full rounded-xl px-4 py-3 text-white shadow-lg ${hasPlaced ? "bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700" : "bg-neutral-300 cursor-not-allowed"}`}
        >
          Continue
        </button>
      </div>
    </section>
  );
}