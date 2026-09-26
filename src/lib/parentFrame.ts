'use client';

import { internalBrowser } from './internalVisit';

/**
 * Tells groundmounts.com, when it embeds this funnel on its /quote page, how
 * far the visitor got.
 *
 * The site's pixel is a different page from this one, so it only learns about
 * a step or a filed lead if we post it a message. Its listener turns these into
 * DesignerStep / DesignerComplete and the Lead it reports on its own pixel.
 *
 * The target origin is exact, never `*`: the lead id rides on the complete
 * message, and a browser drops a message whose target origin is not the
 * parent's, so any other page framing us hears nothing. www.groundmounts.com
 * redirects (308) to the apex, so the apex is the only parent there is.
 */
export const PARENT_ORIGIN = 'https://groundmounts.com';

export type ParentMessage =
  | { type: 'designer:step'; step: number }
  | { type: 'designer:complete'; eventId: string };

function post(message: ParentMessage): void {
  try {
    if (typeof window === 'undefined' || window.parent === window) return;
    // The owner's tests are not progress to report (see internalVisit).
    if (internalBrowser()) return;
    window.parent.postMessage(message, PARENT_ORIGIN);
  } catch {
    /* Like analytics: nothing reported here is worth a broken step. */
  }
}

/** A step came into view. */
export function postStepToParent(step: number): void {
  post({ type: 'designer:step', step });
}

/** The lead was filed. `eventId` is the lead id, the pixel and CAPI's event id. */
export function postLeadToParent(eventId: string): void {
  if (!eventId) return;
  post({ type: 'designer:complete', eventId });
}
