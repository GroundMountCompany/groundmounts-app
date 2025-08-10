"use client";

import React from "react";
import MapDrawTool from "./MapDrawTool";

/**
 * Step1Screen lays out Step 1 (instructions + map) as a single screen
 * on mobile using a 3-row grid that fills the viewport without scrolling
 * The global sticky CTA from pageContainer remains outside this component.
 */
export default function Step1Screen() {
  return (
    <section
      className="
        grid h-[100svh] w-full
        grid-rows-[auto_1fr_auto]
        overflow-hidden bg-white
      "
      aria-label="Find your property"
    >
      {/* Compact instruction bar */}
      <div className="row-start-1 row-end-2 border-b border-neutral-200 bg-white/95 px-4 py-2 sm:px-6">
        <p className="text-[clamp(12px,1.9vw,14px)] font-semibold text-neutral-800">
          Step 1 • Find your property
        </p>
      </div>

      {/* Map fills remaining space, never hidden behind CTA */}
      <div className="row-start-2 row-end-3 relative">
        <div className="absolute inset-0 pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-0">
          <MapDrawTool />
        </div>
      </div>

      {/* Spacer equal to sticky CTA height (mobile only) */}
      <div className="row-start-3 row-end-4 h-[72px] md:hidden" />
    </section>
  );
}