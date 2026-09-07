'use client';

import Image from 'next/image';
import EducationCard from '@/components/shell/EducationCard';
import { STEPS, UI, METER_EXAMPLES } from '@/config/copy';
import { useQuoteStore } from '@/store/quoteStore';

/** What a meter looks like, then tap the map. */
export default function Step3Meter() {
  const placed = useQuoteStore((s) => s.electricalMeterPosition !== null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {METER_EXAMPLES.map((m) => (
          <figure key={m.src} className="overflow-hidden rounded-xl border border-neutral-200">
            <Image
              src={m.src}
              alt={`Electric meter ${m.label.toLowerCase()}`}
              width={210}
              height={158}
              className="aspect-[4/3] w-full object-cover"
            />
            <figcaption className="bg-neutral-50 px-2 py-1.5 text-center text-[15px] text-neutral-700">
              {m.label}
            </figcaption>
          </figure>
        ))}
      </div>

      <p
        data-testid="meter-status"
        className={`text-[17px] ${placed ? 'text-green-700' : 'text-neutral-700'}`}
      >
        {placed ? UI.meterPlaced : UI.meterTapPrompt}
      </p>

      <EducationCard copy={STEPS[2].education} />
    </div>
  );
}
