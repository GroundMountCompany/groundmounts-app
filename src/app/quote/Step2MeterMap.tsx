"use client";

import MapDrawTool from "./MapDrawTool";

export default function Step2MeterMap() {

  return (
    <section className="grid h-[100svh] w-full grid-rows-[auto_1fr_auto] overflow-hidden bg-white">
      <div className="border-b border-neutral-200 bg-white/95 px-4 py-3 sm:px-6">
        <h2 className="text-[clamp(14px,2.4vw,18px)] font-semibold text-neutral-900">
          Click Your Electrical Meter on the Map
        </h2>
        <p className="mt-1 text-[clamp(12px,2vw,14px)] text-neutral-600">
          Find your property and click the exact spot of your electrical meter. Then tap Continue.
        </p>
      </div>

      <div className="relative">
        <div className="absolute inset-0 pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-0">
          <MapDrawTool />
        </div>
      </div>

      <div className="h-[72px] md:hidden" />
    </section>
  );
}