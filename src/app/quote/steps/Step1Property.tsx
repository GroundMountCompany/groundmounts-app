'use client';

import EducationCard from '@/components/shell/EducationCard';
import { STEPS } from '@/config/copy';

/**
 * The address box itself lives over the map, not in the sheet — at the peek
 * snap point the sheet is only tall enough for the heading and the button, and
 * the first thing a customer must be able to do is type.
 */
export default function Step1Property() {
  return (
    <div className="space-y-4">
      <EducationCard copy={STEPS[0].education} />
    </div>
  );
}
