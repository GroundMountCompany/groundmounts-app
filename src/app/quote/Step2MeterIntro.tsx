"use client";

import { useQuoteContext } from "@/contexts/quoteContext";

export default function Step2MeterIntro() {
  const { setCurrentStepIndex } = useQuoteContext();

  const handleContinue = () => {
    setCurrentStepIndex(2); // Go to Step 2B (MeterMap)
  };

  return (
    <section className="w-full bg-gradient-to-b from-amber-50 to-white px-4 py-5 sm:px-6">
      {/* Icon + Title */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-neutral-900">
            Find Your Electrical Meter
          </h2>
          <p className="text-xs text-neutral-500">Step 2 of 3</p>
        </div>
      </div>

      {/* Why this matters - benefit focused */}
      <div className="bg-white rounded-xl p-4 border border-neutral-200 shadow-sm mb-4">
        <p className="text-sm text-neutral-700 leading-relaxed">
          Your meter connects your solar system to the grid. We need its location to calculate
          <span className="font-semibold text-neutral-900"> trenching distance</span> — the underground cable run from your panels to the meter.
        </p>
      </div>

      {/* Meter images - side by side, larger */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="relative">
          <img
            src="/images/meter-img.PNG"
            alt="Wall-mounted electrical meter on house exterior"
            className="w-full aspect-[4/3] object-cover rounded-xl border-2 border-neutral-200 shadow-sm"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent rounded-b-xl px-2 py-1.5">
            <p className="text-xs font-medium text-white text-center">Wall-mounted</p>
          </div>
        </div>
        <div className="relative">
          <img
            src="/images/meter-img2.PNG"
            alt="Pole-mounted electrical meter near property line"
            className="w-full aspect-[4/3] object-cover rounded-xl border-2 border-neutral-200 shadow-sm"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent rounded-b-xl px-2 py-1.5">
            <p className="text-xs font-medium text-white text-center">Pole-mounted</p>
          </div>
        </div>
      </div>

      {/* Quick tips - scannable */}
      <div className="flex items-start gap-2 mb-5 bg-amber-50 rounded-lg px-3 py-2.5 border border-amber-200">
        <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <p className="text-xs text-amber-800">
          <span className="font-semibold">Common locations:</span> Side of house, near the driveway, property line, or utility pole
        </p>
      </div>

      {/* CTA Button */}
      <button
        onClick={handleContinue}
        className="w-full rounded-xl bg-neutral-900 px-6 py-4 text-white font-semibold text-base hover:bg-neutral-800 active:scale-[0.98] transition-all shadow-lg flex items-center justify-center gap-2"
      >
        <span>I&apos;m ready to locate my meter</span>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
        </svg>
      </button>
    </section>
  );
}
