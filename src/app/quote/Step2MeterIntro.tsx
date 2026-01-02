"use client";

import { useQuoteContext } from "@/contexts/quoteContext";

export default function Step2MeterIntro() {
  const { setCurrentStepIndex } = useQuoteContext();

  const handleContinue = () => {
    setCurrentStepIndex(2); // Go to Step 2B (MeterMap)
  };

  return (
    <section className="w-full bg-white px-4 py-4 sm:px-6 sm:py-6">
      {/* Header */}
      <h2 className="text-base font-semibold text-neutral-900 mb-3">
        Step 2 • Find Your Electrical Meter
      </h2>

      {/* Quick explanation */}
      <p className="text-sm text-neutral-700 mb-4">
        Tap where your meter is located to calculate trenching costs.
      </p>

      {/* Side-by-side meter examples - larger images */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1">
          <img
            src="/images/meter-img.PNG"
            alt="House-mounted meter"
            className="w-full h-36 sm:h-44 object-cover rounded-lg border border-neutral-200"
          />
          <p className="text-xs text-neutral-500 mt-1.5 text-center">Wall-mounted</p>
        </div>
        <div className="flex-1">
          <img
            src="/images/meter-img2.PNG"
            alt="Pole-mounted meter"
            className="w-full h-36 sm:h-44 object-cover rounded-lg border border-neutral-200"
          />
          <p className="text-xs text-neutral-500 mt-1.5 text-center">Pole-mounted</p>
        </div>
      </div>

      {/* Where to look - inline */}
      <p className="text-xs text-neutral-500 mb-5">
        <span className="font-medium text-neutral-700">Look:</span> Side of house • Property line • Utility area
      </p>

      {/* CTA - directly after content, no spacer */}
      <button
        onClick={handleContinue}
        className="w-full rounded-xl bg-neutral-900 px-6 py-3.5 text-white font-semibold text-base hover:bg-neutral-800 active:bg-neutral-700 transition-all shadow-md"
      >
        Got it, let&apos;s find my meter
      </button>
    </section>
  );
}