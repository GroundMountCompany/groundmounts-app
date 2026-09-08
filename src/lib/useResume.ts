'use client';

import { useEffect, useState } from 'react';
import { useQuoteStore } from '@/store/quoteStore';
import type { ResumeSnapshot } from './resumeSnapshot';
import { track } from './analytics';

/** What the funnel should say about a resume attempt, if anything. */
export type ResumeState = 'idle' | 'loading' | 'ok' | 'expired' | 'invalid';

/**
 * Put a saved design back, from a link in an email.
 *
 * The link carries a lead id and a signature and nothing else — the design
 * itself lives on the server, so a forwarded email cannot reconstruct one and
 * a URL in somebody's browser history is not a copy of their property.
 *
 * Runs once and strips its own parameters afterwards, for the same reason
 * ?reset=1 does: a refresh should not silently re-hydrate over work the
 * customer has done since, and the signed token has no business staying in
 * the address bar where it will be pasted into a support chat.
 */
export function useResume(): ResumeState {
  const [state, setState] = useState<ResumeState>('idle');

  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get('resume');
    const token = url.searchParams.get('t');
    if (!id || !token) return;

    // Stripped immediately, before the request: whatever happens next, this
    // must not run twice on a reload.
    url.searchParams.delete('resume');
    url.searchParams.delete('t');
    window.history.replaceState(window.history.state, '', url.toString());

    let cancelled = false;
    setState('loading');

    /**
     * Wait for the store to finish rehydrating before writing over it.
     *
     * `persist` is created with `skipHydration`, so rehydration is kicked off
     * by QuoteStoreHydrator in an effect and completes asynchronously. A
     * snapshot applied before that lands is silently replaced by whatever was
     * in localStorage — usually nothing, which put a resumed customer back on
     * step 1 holding a valid link. The fetch itself is slower than rehydration
     * in practice; this makes it certain rather than likely.
     */
    const settled = new Promise<void>((resolve) => {
      if (useQuoteStore.getState().hydrated) {
        resolve();
        return;
      }
      const stop = useQuoteStore.subscribe((s) => {
        if (s.hydrated) {
          stop();
          resolve();
        }
      });
      // A store that never reports hydrated must not strand the customer on a
      // spinner. Restoring over defaults is better than not restoring at all.
      setTimeout(() => {
        stop();
        resolve();
      }, 5000);
    });

    void (async () => {
      try {
        const res = await fetch(
          `/api/resume?id=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`
        );
        if (cancelled) return;

        if (res.status === 410) {
          setState('expired');
          return;
        }
        if (!res.ok) {
          setState('invalid');
          return;
        }

        const json = (await res.json()) as { ok?: boolean; snapshot?: ResumeSnapshot };
        if (cancelled) return;
        if (!json.ok || !json.snapshot) {
          setState('invalid');
          return;
        }

        await settled;
        if (cancelled) return;

        applySnapshot(id, json.snapshot);
        track('resume_opened', { step: json.snapshot.step });
        setState('ok');
      } catch {
        if (!cancelled) setState('invalid');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/**
 * Write the snapshot over the store, in one set.
 *
 * One `setState` rather than a run of setters: each setter re-renders, and a
 * sequence of them would put the funnel through several inconsistent
 * intermediate states — a coordinate without a design, a design without a
 * step — each of which the map and the sizing effects would react to.
 *
 * The lead id comes from the link rather than the snapshot so the resumed
 * funnel keeps writing to the same Airtable row.
 */
function applySnapshot(leadId: string, snap: ResumeSnapshot): void {
  useQuoteStore.setState({
    leadId,
    currentStepIndex: snap.step,
    coordinates: snap.coordinates,
    electricalMeterPosition: snap.electricalMeterPosition,
    arrayCenter: snap.arrayCenter,
    azimuth: snap.azimuth,
    totalPanels: snap.totalPanels,
    panelAdjust: snap.panelAdjust,
    sizingMode: snap.sizingMode,
    trenchFeet: snap.trenchFeet,
    avgValue: snap.avgValue,
    rateCentsPerKwh: snap.rateCentsPerKwh,
    percentage: snap.percentage,
    billAnnualKwh: snap.billAnnualKwh,
    panelTier: snap.panelTier,
    slopeAnswer: snap.slopeAnswer,
    rocky: snap.rocky,
    needsClearing: snap.needsClearing,
    batteryInterest: snap.batteryInterest,
    // A resumed funnel has already been designed once, so the array does not
    // need to pulse at somebody who has already dragged it.
    arrayTouched: true,
    hydrated: true,
  });
}
