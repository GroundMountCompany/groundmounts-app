import { useQuoteStore } from '@/store/quoteStore';
import type { QuoteInputs } from './quoteInputs';

/**
 * Save the design as the customer goes.
 *
 * Most people who start this funnel do not finish it. A design abandoned at
 * step 4 is still worth something to the owner — it is a real parcel with a
 * real array on it — and it is worth nothing if it only exists in a browser
 * that gets closed.
 *
 * Carries no PII by design. Name, email, phone and address join at step 6, so
 * an abandoned funnel leaves an anonymous row keyed on the lead id rather than
 * a half-filled contact record.
 */

/** The funnel's ?source=, which is where the brand comes from too. */
function sourceFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return new URLSearchParams(window.location.search).get('source') ?? undefined;
}

/** Steps that are worth recording: address found, meter placed, design done. */
const SAVE_AT_STEPS = [1, 3, 4] as const;

/** Highest step already sent, so a back-and-forth does not re-send. */
const sent = new Set<number>();

export function resetPartialSaves(): void {
  sent.clear();
}

function inputsFrom(s: ReturnType<typeof useQuoteStore.getState>): QuoteInputs | null {
  if (s.totalPanels <= 0) return null;
  return {
    panelCount: s.totalPanels,
    tier: s.panelTier,
    trenchFeet: s.trenchFeet,
    batteryUnits: s.batteryUnits,
    needsClearing: s.needsClearing,
    slopeAnswer: s.slopeAnswer,
    rocky: s.rocky,
    batteryInterest: s.batteryInterest,
    slopePercent: s.slopePercent,
    slopeTier: s.slopeTier,
    soilClass: s.soilClass,
    azimuth: Math.round(s.azimuth),
    arrayCenter: s.arrayCenter,
  };
}

/**
 * Fire and forget. A partial save is never allowed to be visible: no spinner,
 * no error, no blocked Continue button. If it fails, it failed.
 */
export function savePartialLead(step: number): void {
  if (!SAVE_AT_STEPS.includes(step as (typeof SAVE_AT_STEPS)[number])) return;
  if (sent.has(step)) return;

  const s = useQuoteStore.getState();
  if (!s.leadId) return;
  sent.add(step);

  const inputs = inputsFrom(s);

  void fetch('/api/leads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Declared in a header so the route can rate-limit a partial before it
      // parses the body it would otherwise have to read to find out.
      'x-gm-partial': '1',
    },
    keepalive: true,
    body: JSON.stringify({
      partial: true,
      id: s.leadId,
      stepReached: step,
      source: sourceFromUrl(),
      coordinates: s.coordinates,
      ...(inputs ? { inputs } : {}),
    }),
  }).catch(() => {
    // Deliberately silent. Let the next step try again.
    sent.delete(step);
  });
}
