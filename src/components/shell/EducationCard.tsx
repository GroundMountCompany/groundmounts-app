'use client';

import { useState } from 'react';
import type { EducationCopy } from '@/config/copy';
import { UI } from '@/config/copy';

/**
 * One line by default, more on request.
 *
 * Every step has one. The default line has to earn its place on a phone screen,
 * so it is a single sentence; anything longer goes behind "Learn more".
 */
export default function EducationCard({
  copy,
  extra,
}: {
  copy: EducationCopy;
  /** Step-specific long copy, shown alongside `more` behind the same toggle. */
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      data-testid="education-card"
      className="rounded-xl border border-neutral-200 bg-neutral-50 p-4"
    >
      <p className="text-[17px] leading-snug text-neutral-800">{copy.why}</p>

      {open && (
        <p data-testid="education-more" className="mt-3 text-[16px] leading-relaxed text-neutral-700">
          {copy.more}
        </p>
      )}

      {open && extra && (
        <p data-testid="education-extra" className="mt-3 text-[16px] leading-relaxed text-neutral-700">
          {extra}
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 min-h-[48px] text-[16px] font-semibold text-neutral-900 underline underline-offset-2"
      >
        {open ? UI.showLess : UI.learnMore}
      </button>
    </div>
  );
}
