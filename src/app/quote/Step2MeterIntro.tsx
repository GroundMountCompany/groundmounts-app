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
      <div className="shrink-0 border-b border-neutral-200 bg-white/95 px-4 py-2">
        <h2 className="text-base font-semibold text-neutral-900">
          Step 2 • Find Your Electrical Meter
        </h2>
      </div>

      {/* Main content - fits above fold on mobile */}
      <div className="flex-1 flex flex-col px-4 py-2 sm:px-6 sm:py-3">
        {/* Quick explanation */}
        <p className="text-sm text-neutral-700 mb-2">
          Tap where your meter is located to calculate trenching costs.
        </p>

        {/* Side-by-side meter examples */}
        <div className="flex gap-2 mb-2">
          <div className="flex-1">
            <img
              src="/images/meter-img.PNG"
              alt="House-mounted meter"
              className="w-full h-20 sm:h-28 object-cover rounded-lg border border-neutral-200"
            />
            <p className="text-[11px] text-neutral-500 mt-1 text-center">Wall-mounted</p>
          </div>
          <div className="flex-1">
            <img
              src="/images/meter-img2.PNG"
              alt="Pole-mounted meter"
              className="w-full h-20 sm:h-28 object-cover rounded-lg border border-neutral-200"
            />
            <p className="text-[11px] text-neutral-500 mt-1 text-center">Pole-mounted</p>
          </div>
        </div>

        {/* Where to look - inline */}
        <p className="text-xs text-neutral-500 mb-3">
          <span className="font-medium text-neutral-700">Look:</span> Side of house • Property line • Utility area
        </p>

        {/* Spacer pushes button to bottom */}
        <div className="flex-1 min-h-2" />

        {/* CTA */}
        <button
          onClick={handleContinue}
          className="w-full rounded-xl bg-neutral-900 px-6 py-3.5 text-white font-semibold text-base hover:bg-neutral-800 active:bg-neutral-700 transition-all shadow-md"
        >
          Got it, let&apos;s find my meter
        </button>
      </div>

      {/* Safe area spacer for mobile */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </section>
  );
}