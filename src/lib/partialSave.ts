import { useQuoteStore } from '@/store/quoteStore';
import type { QuoteInputs } from './quoteInputs';
import type { ResumeSnapshot } from './resumeSnapshot';

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

/**
 * The design as it stands, for a link back to it.
 *
 * Built from an explicit list in resumeSnapshot.ts, so a field added to the
 * store later cannot join this by accident. Sent with every partial save, not
 * only when somebody asks for a link: by the time they ask, the snapshot has
 * to already be there, and building it on demand would mean a save that could
 * fail at the moment it mattered most.
 */
export function snapshotFrom(s: ReturnType<typeof useQuoteStore.getState>): ResumeSnapshot {
  return {
    version: 1,
    step: s.currentStepIndex,
    coordinates: s.coordinates,
    electricalMeterPosition: s.electricalMeterPosition,
    arrayCenter: s.arrayCenter,
    azimuth: s.azimuth,
    totalPanels: s.totalPanels,
    panelAdjust: s.panelAdjust,
    sizingMode: s.sizingMode,
    trenchFeet: s.trenchFeet,
    avgValue: s.avgValue,
    rateCentsPerKwh: s.rateCentsPerKwh,
    percentage: s.percentage,
    billAnnualKwh: s.billAnnualKwh,
    panelTier: s.panelTier,
    slopeAnswer: s.slopeAnswer,
    rocky: s.rocky,
    needsClearing: s.needsClearing,
    batteryInterest: s.batteryInterest,
    savedAt: Date.now(),
  };
}

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
      utm: s.utm,
      snapshot: snapshotFrom(s),
      ...(inputs ? { inputs } : {}),
    }),
  }).catch(() => {
    // Deliberately silent. Let the next step try again.
    sent.delete(step);
  });
}

/**
 * Ask for a link back to this design, by email.
 *
 * The one PII field a partial may ever carry, and only because the customer
 * has just typed it into a box that says what it is for. Everything else about
 * a partial stays anonymous — see the note at the top of this file.
 *
 * Not fire-and-forget, unlike the saves above: somebody who taps "Finish
 * later" is waiting to be told it worked, so this reports back.
 */
export async function requestResumeEmail(email: string): Promise<boolean> {
  const s = useQuoteStore.getState();
  if (!s.leadId) return false;

  try {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-gm-partial': '1' },
      body: JSON.stringify({
        partial: true,
        resumeRequest: true,
        id: s.leadId,
        // The step they are standing on, so the link comes back to it.
        stepReached: s.currentStepIndex,
        email,
        source: sourceFromUrl(),
        utm: s.utm,
        coordinates: s.coordinates,
        snapshot: snapshotFrom(s),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; sent?: boolean };
    return res.ok && json.ok === true && json.sent === true;
  } catch {
    return false;
  }
}
