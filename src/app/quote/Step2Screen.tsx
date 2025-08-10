"use client";

import React, { useState, useEffect } from "react";
import { useQuoteContext } from "@/contexts/quoteContext";
import MapDrawTool from "./MapDrawTool";
import Step2Form from "./Step2Form";
import { cn } from "@/lib/utils";

/**
 * Step2Screen manages the two-phase Step 2 flow:
 * - "intro": Shows instructions and example images
 * - "map": Shows the map for placing the electrical meter
 */
export default function Step2Screen() {
  const { 
    electricalMeterPosition, 
    shouldContinueButtonDisabled,
    setCurrentStepIndex,
    currentStepIndex 
  } = useQuoteContext();
  
  const [phase, setPhase] = useState<"intro" | "map">("intro");
  const [localHasPlaced, setLocalHasPlaced] = useState(false);
  const [showForm, setShowForm] = useState(true);

  // Track when meter is placed
  useEffect(() => {
    if (electricalMeterPosition && electricalMeterPosition[0] !== 0) {
      setLocalHasPlaced(true);
    }
  }, [electricalMeterPosition]);

  // Handle the Continue button for Step 2
  const goNext = () => {
    if (currentStepIndex < 2) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  // Intro phase: show instructions and examples
  if (phase === "intro") {
    return (
      <section className="grid h-[100svh] grid-rows-[auto_1fr_auto] w-full overflow-hidden bg-white">
        {/* Header */}
        <div className="border-b border-neutral-200 bg-white/95 px-4 py-3 sm:px-6">
          <h2 className="text-[clamp(14px,2.4vw,18px)] font-semibold text-neutral-900">
            Step 2 • Energy Calculations & Meter Location
          </h2>
          <p className="mt-1 text-[clamp(12px,2vw,14px)] text-neutral-600">
            First, tell us about your energy usage. Then we&apos;ll help you locate your electrical meter.
          </p>
        </div>

        {/* Energy form content */}
        <div className="overflow-auto px-4 py-4 sm:px-6">
          <Step2Form showForm={showForm} setShowForm={setShowForm} />
          
          {/* Meter location instructions */}
          <div className="mt-8 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <h3 className="font-semibold text-neutral-900 mb-2">
              Next: Locate Your Electrical Meter
            </h3>
            <p className="text-sm text-neutral-600 mb-4">
              Your electrical meter might be:
            </p>
            <ul className="space-y-2 text-sm text-neutral-700">
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Mounted on the side of your house</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>On a pole near your property line</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>In a utility area or garage</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom action */}
        <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+72px)] pt-2 sm:px-6 md:pb-4">
          <button
            type="button"
            onClick={() => setPhase("map")}
            disabled={shouldContinueButtonDisabled}
            className={cn(
              "w-full rounded-xl px-4 py-3 font-semibold transition-all",
              shouldContinueButtonDisabled
                ? "bg-gray-400 text-white cursor-not-allowed"
                : "bg-neutral-900 text-white hover:bg-neutral-800 active:bg-neutral-700"
            )}
          >
            Continue to Meter Placement
          </button>
        </div>
      </section>
    );
  }

  // Map phase: place the electrical meter
  return (
    <>
      <section className="grid h-[100svh] w-full grid-rows-[auto_1fr_auto] overflow-hidden bg-white">
        {/* Header */}
        <div className="border-b border-neutral-200 bg-white/95 px-4 py-3 sm:px-6">
          <h2 className="text-[clamp(14px,2.4vw,18px)] font-semibold text-neutral-900">
            Click Your Electrical Meter on the Map
          </h2>
          <p className="mt-1 text-[clamp(12px,2vw,14px)] text-neutral-600">
            Find your home and click/tap the exact spot where your electrical meter is located.
          </p>
        </div>

        {/* Map area fills remaining height */}
        <div className="relative">
          <div className="absolute inset-0 pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-0">
            <MapDrawTool />
          </div>
        </div>

        {/* Spacer row for mobile sticky CTA */}
        <div className="h-[72px] md:hidden" />
      </section>

      {/* Mobile sticky CTA for map phase */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/90 backdrop-blur px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={goNext}
          disabled={!localHasPlaced}
          className={cn(
            "w-full h-12 rounded-xl text-base font-semibold shadow active:scale-[.99] hover:opacity-95",
            !localHasPlaced
              ? "bg-gray-400 text-white cursor-not-allowed"
              : "bg-black text-white"
          )}
        >
          Continue
        </button>
      </div>
    </>
  );
}