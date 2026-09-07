'use client';

import { useState } from 'react';
import Image from 'next/image';
import { UI } from '@/config/copy';

/** The supplied artwork, and its real dimensions. */
const IMAGE = { src: '/images/sun-scale.png', width: 1672, height: 941 };

const FACTS = [UI.whyFactWidth, UI.whyFactVolume, UI.whyFactHour];

/**
 * The sun beside the Earth, drawn to scale.
 *
 * Shown when the photograph is not there. Not a placeholder box: a customer
 * who sees this instead of the artwork should still get the point, which is
 * the ratio. The circles are to scale — 109 across, so 4 to 436 in a 480-wide
 * frame — and that is the whole argument in one line of geometry.
 */
function SunScaleFallback() {
  return (
    <svg
      data-testid="why-image-fallback"
      viewBox="0 0 480 270"
      role="img"
      aria-label={UI.whyImageAlt}
      className="h-auto w-full rounded-xl bg-neutral-900"
    >
      <defs>
        <radialGradient id="gm-sun" cx="35%" cy="35%">
          <stop offset="0%" stopColor="#fff7ed" />
          <stop offset="55%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#ea580c" />
        </radialGradient>
      </defs>
      {/* The sun, running off the frame, because at this scale it does. */}
      <circle cx="110" cy="135" r="218" fill="url(#gm-sun)" />
      {/* The Earth: 1/109th of the sun's diameter, which is 2px against 218. */}
      <circle cx="430" cy="135" r="2" fill="#60a5fa" />
      <text x="430" y="158" fill="#a3a3a3" fontSize="11" textAnchor="middle">
        {UI.whyEarthLabel}
      </text>
    </svg>
  );
}

/**
 * Payback is one reason. This is the other.
 *
 * Deliberately short: one line, one paragraph, one picture and three facts.
 * The argument is not that the sun is remarkable but that it is dull, which is
 * worth something when the alternative has a hundred ways to fail.
 */
export default function WhyPeopleDoThis() {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <section data-testid="why-section" className="space-y-3">
      <div>
        <h4 className="text-[19px] font-semibold text-neutral-900">{UI.whyTitle}</h4>
        <p className="mt-1 text-[17px] font-medium leading-snug text-neutral-800">{UI.whyLead}</p>
      </div>

      <p className="text-[17px] leading-relaxed text-neutral-700">{UI.whyBody}</p>

      {imageFailed ? (
        <SunScaleFallback />
      ) : (
        <Image
          data-testid="why-image"
          src={IMAGE.src}
          alt={UI.whyImageAlt}
          width={IMAGE.width}
          height={IMAGE.height}
          // Below the fold of a screen the customer arrives at from a form, so
          // it must not compete with the price for bandwidth.
          loading="lazy"
          sizes="(max-width: 767px) 100vw, 720px"
          className="h-auto w-full rounded-xl"
          // A missing file is not a reason to lose the point of the section.
          onError={() => setImageFailed(true)}
        />
      )}

      <ul data-testid="why-facts" className="grid gap-2 sm:grid-cols-3">
        {FACTS.map((fact) => (
          <li
            key={fact}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-[16px] leading-snug text-neutral-700"
          >
            {fact}
          </li>
        ))}
      </ul>
    </section>
  );
}
