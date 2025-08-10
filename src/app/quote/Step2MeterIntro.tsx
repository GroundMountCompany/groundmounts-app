"use client";

import { useQuoteContext } from "@/contexts/quoteContext";

export default function Step2MeterIntro() {
  const { setCurrentStepIndex } = useQuoteContext();

  const handleContinue = () => {
    setCurrentStepIndex(2); // Go to Step 2B (MeterMap)
  };

  return (
    <section className="grid h-[100svh] w-full grid-rows-[auto_1fr_auto] overflow-hidden bg-white">
      <div className="border-b border-neutral-200 bg-white/95 px-4 py-3 sm:px-6">
        <h2 className="text-[clamp(14px,2.4vw,18px)] font-semibold text-neutral-900">
          Step 2 • Locate Your Electrical Meter
        </h2>
        <p className="mt-1 text-[clamp(12px,2vw,14px)] text-neutral-600">
          On the next screen, you&apos;ll click the exact spot on your property where your electrical meter is located.
        </p>
      </div>

      <div className="overflow-auto px-4 py-4 sm:px-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 mb-6">
          <div className="flex flex-col items-center">
            <h3 className="text-sm font-medium text-neutral-700 mb-3">House-mounted meter example</h3>
            <img 
              src="/images/meter-img.PNG" 
              alt="House-mounted meter example" 
              className="w-full max-w-sm rounded-xl border border-neutral-200 shadow-sm"
            />
          </div>
          <div className="flex flex-col items-center">
            <h3 className="text-sm font-medium text-neutral-700 mb-3">Pole-mounted meter example</h3>
            <img 
              src="/images/meter-img2.PNG" 
              alt="Pole-mounted meter example" 
              className="w-full max-w-sm rounded-xl border border-neutral-200 shadow-sm"
            />
          </div>
        </div>
        
        <div className="max-w-md mx-auto">
          <ul className="list-disc pl-6 text-[clamp(12px,2vw,14px)] text-neutral-700 mb-8">
            <li>Mounted on the side of your house</li>
            <li>On a pole near your property line</li>
            <li>In a utility area or garage</li>
          </ul>
          
          <button
            onClick={handleContinue}
            className="w-full rounded-xl bg-neutral-900 px-6 py-4 text-white font-semibold text-base hover:bg-neutral-800 active:bg-neutral-700 transition-all duration-200 shadow-md"
          >
            I understand, continue
          </button>
        </div>
      </div>

      {/* Bottom spacer so global sticky CTA doesn't overlap content */}
      <div className="h-[72px] md:hidden" />
    </section>
  );
}