"use client";

import React from "react";
import MapDrawTool from "./MapDrawTool";

/**
 * Step1Screen lays out Step 1 (instructions + search + map) as a single screen
 * on mobile using a 4-row grid: header / search / map / spacer-for-CTA
 * The global sticky CTA from pageContainer remains outside this component.
 */
export default function Step1Screen() {
  return (
    <section
      className={`
        grid w-full
        h-[100svh] md:h-auto
        grid-rows-[auto_1fr_auto]
        overflow-hidden bg-white
      `}
      aria-label="Find your property"
    >
      {/* 1) Compact instruction bar */}
      <div className="row-start-1 row-end-2 border-b border-neutral-200 bg-white/95 px-4 py-2 sm:px-6">
        <p className="text-[13px] font-medium leading-snug text-neutral-700">
          Step 1 &middot; Find your property
        </p>
        <p className="text-[12px] leading-snug text-neutral-500">
          Search your address, then pan/zoom the map to center your land.
        </p>
      </div>

      {/* 2) Map and address input - MapDrawTool handles both */}
      <div className="row-start-2 row-end-3 relative min-h-[280px]">
        {/* Reserve space for the sticky CTA below so the map never hides behind it */}
        <div className="absolute inset-0 pb-[88px] md:pb-0">
          {/* Keep your exact MapDrawTool component; it contains AddressInput + Map */}
          <MapDrawTool />
        </div>
      </div>

      {/* 3) Spacer row for sticky CTA height (mobile only) */}
      <div className="row-start-3 row-end-4 block h-[88px] md:hidden" />
    </section>
  );
}