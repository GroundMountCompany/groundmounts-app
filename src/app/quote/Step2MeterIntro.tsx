"use client";

import { useQuoteContext } from "@/contexts/quoteContext";

export default function Step2MeterIntro() {
  const { setCurrentStepIndex } = useQuoteContext();

  const handleContinue = () => {
    setCurrentStepIndex(2); // Go to Step 2B (MeterMap)
  };

  return (
    <section className="flex flex-col h-[100svh] w-full overflow-hidden bg-white">
      {/* Compact header */}
      <div className="shrink-0 border-b border-neutral-200 bg-white/95 px-4 py-3 sm:px-6">
        <h2 className="text-base sm:text-lg font-semibold text-neutral-900">
          Step 2 • Find Your Electrical Meter
        </h2>
      </div>

      {/* Main content - designed to fit above fold on mobile */}
      <div className="flex-1 flex flex-col px-4 py-3 sm:px-6 sm:py-4 overflow-auto">
        {/* Quick explanation */}
        <p className="text-sm text-neutral-700 mb-3">
          Next, you&apos;ll tap the map where your meter is located. This helps us calculate trenching costs.
        </p>

        {/* Compact meter examples - horizontal scroll on mobile */}
        <div className="flex gap-3 mb-4 overflow-x-auto pb-2 -mx-1 px-1">
          <div className="shrink-0 w-36 sm:w-48">
            <img
              src="/images/meter-img.PNG"
              alt="House-mounted meter"
              className="w-full h-24 sm:h-32 object-cover rounded-lg border border-neutral-200"
            />
            <p className="text-xs text-neutral-600 mt-1 text-center">Wall-mounted</p>
          </div>
          <div className="shrink-0 w-36 sm:w-48">
            <img
              src="/images/meter-img2.PNG"
              alt="Pole-mounted meter"
              className="w-full h-24 sm:h-32 object-cover rounded-lg border border-neutral-200"
            />
            <p className="text-xs text-neutral-600 mt-1 text-center">Pole-mounted</p>
          </div>
        </div>

        {/* Where to look - compact */}
        <div className="bg-neutral-50 rounded-lg p-3 mb-4">
          <p className="text-xs font-medium text-neutral-800 mb-1">Where to look:</p>
          <p className="text-xs text-neutral-600">
            Side of house • Near property line • Utility area
          </p>
        </div>

        {/* Spacer pushes button to bottom */}
        <div className="flex-1 min-h-4" />

        {/* CTA */}
        <button
          onClick={handleContinue}
          className="w-full rounded-xl bg-neutral-900 px-6 py-4 text-white font-semibold text-base hover:bg-neutral-800 active:bg-neutral-700 transition-all duration-200 shadow-md mb-safe"
        >
          Got it, let&apos;s find my meter
        </button>
      </div>

      {/* Safe area spacer for mobile */}
      <div className="h-[env(safe-area-inset-bottom)] md:hidden" />
    </section>
  );
}