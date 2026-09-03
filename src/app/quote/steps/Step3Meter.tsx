'use client';

import Image from 'next/image';
import EducationCard from '@/components/shell/EducationCard';
import { STEPS } from '@/config/copy';
import { useQuoteStore } from '@/store/quoteStore';

/** What a meter looks like, then tap the map. */
export default function Step3Meter() {
  const placed = useQuoteStore((s) => s.electricalMeterPosition !== null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          { src: '/images/meter-img.PNG', label: 'On a wall' },
          { src: '/images/meter-img2.PNG', label: 'On a pole' },
        ].map((m) => (
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
        {placed ? 'Meter placed. Drag it if it is off.' : 'Tap the map where your meter sits.'}
      </p>

      <EducationCard copy={STEPS[2].education} />
    </div>
  );
}
