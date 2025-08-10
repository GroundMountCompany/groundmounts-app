"use client";

export default function Step2MeterIntro() {
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <img src="/images/meter-house.jpg" alt="House-mounted meter example" className="w-full rounded-xl border border-neutral-200" />
          <img src="/images/meter-pole.jpg" alt="Pole-mounted meter example" className="w-full rounded-xl border border-neutral-200" />
        </div>
        <ul className="mt-4 list-disc pl-6 text-[clamp(12px,2vw,14px)] text-neutral-700">
          <li>Mounted on the side of your house</li>
          <li>On a pole near your property line</li>
          <li>In a utility area or garage</li>
        </ul>
      </div>

      {/* Bottom spacer so global sticky CTA doesn't overlap content */}
      <div className="h-[72px] md:hidden" />
    </section>
  );
}