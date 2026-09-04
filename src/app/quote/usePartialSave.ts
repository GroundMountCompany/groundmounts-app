'use client';

import { useEffect } from 'react';
import { useQuoteStore } from '@/store/quoteStore';
import { savePartialLead } from '@/lib/partialSave';

/**
 * Record the design at the steps worth recording.
 *
 * Mounted once in the shell rather than in the steps themselves, so a step
 * component re-rendering does not re-send and a step nobody scrolled to does
 * not send at all.
 */
export function usePartialSave(): void {
  const step = useQuoteStore((s) => s.currentStepIndex);
  const hydrated = useQuoteStore((s) => s.hydrated);
  const leadFiled = useQuoteStore((s) => s.leadFiled);

  useEffect(() => {
    // Nothing before the persisted state is back, or the lead id would be the
    // one this tab invented rather than the one the funnel has been using.
    if (!hydrated) return;
    // A filed lead is a finished funnel; a partial save after it would put the
    // record back to Status Partial.
    if (leadFiled) return;
    savePartialLead(step);
  }, [step, hydrated, leadFiled]);
}
