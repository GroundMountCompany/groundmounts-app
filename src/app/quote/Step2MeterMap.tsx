"use client";

import { useCallback } from "react";
import { useQuoteContext } from "@/contexts/quoteContext";
import MapCanvas from "@/components/map/MapCanvas";

enum QuoteStep {
  Address = 0,
  MeterIntro = 1,
  MeterMap = 2,
  EnergyCalcs = 3,
}

export default function Step2MeterMap() {
  const { setCurrentStepIndex, electricalMeterPosition } = useQuoteContext();

  // Derived from the store rather than mirrored in local state, so a restored
  // meter is recognised on reload instead of the button staying disabled.
  const hasPlaced =
    Array.isArray(electricalMeterPosition) && electricalMeterPosition.length === 2;

  const goNext = useCallback(() => {
    if (!hasPlaced) return;
    setCurrentStepIndex(QuoteStep.EnergyCalcs);
  }, [hasPlaced, setCurrentStepIndex]);

  return (
    <section className="flex flex-col w-full overflow-hidden bg-white h-[100svh] md:h-auto">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-neutral-200 bg-white px-4 py-3 sm:px-6">
        <h2 className="text-base font-semibold text-neutral-900">
          Tap Your Electrical Meter Location
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Find your property and tap where your meter is. You can tap again to adjust.
        </p>
      </div>

      {/* Map - full height on mobile, fixed height on desktop */}
      <div className="flex-1 min-h-0 relative md:flex-none md:h-[500px]">
        <MapCanvas mode="place-meter" />
      </div>

      {/* Continue button - always visible at bottom */}
      <div className="flex-shrink-0 bg-white border-t border-neutral-200 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-6">
        <button
          type="button"
          onClick={goNext}
          disabled={!hasPlaced}
          className={`w-full rounded-xl px-4 py-3.5 text-white font-semibold shadow-lg transition-all ${
            hasPlaced
              ? "bg-neutral-900 hover:bg-neutral-800 active:scale-[0.98]"
              : "bg-neutral-300 cursor-not-allowed"
          }`}
        >
          {hasPlaced ? "Continue" : "Tap the map to place your meter"}
        </button>
      </div>
    </section>
  );
}