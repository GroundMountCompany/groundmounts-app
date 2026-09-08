'use client';

import { useQuoteStore } from '@/store/quoteStore';
import { fbqSafe } from './fb';
import { utmFromSearch } from './utm';

export { utmFromSearch };

/**
 * Every event this funnel emits, named once.
 *
 * A union rather than a string, so a typo is a build failure instead of an
 * event that silently never appears in a funnel report. The names are the
 * owner's; nothing here invents one.
 */
export type AnalyticsEvent =
  | 'step_viewed'
  | 'address_selected'
  | 'use_location_tapped'
  | 'bill_upload_started'
  | 'bill_upload_succeeded'
  | 'bill_upload_failed'
  | 'bill_manual_used'
  | 'meter_placed'
  | 'meter_moved'
  | 'array_dragged'
  | 'array_rotated'
  | 'panels_adjusted'
  | 'face_south'
  | 'auto_size_toggled'
  | 'sheet_toggled'
  | 'option_selected'
  | 'coach_dismissed'
  | 'resume_requested'
  | 'resume_opened'
  | 'unlock_tapped'
  | 'lead_filed'
  | 'email_sent'
  | 'book_call_tapped';

export type Props = Record<string, unknown>;

/**
 * Analytics must never be able to break the funnel.
 *
 * Not a slogan — a rule with teeth. Every export here is wrapped, every
 * failure is swallowed, and an unset key is a no-op rather than an error. A
 * customer standing in a field with a bad connection is going to get a quote
 * whatever PostHog is doing, and a blocked script (an ad blocker, a corporate
 * proxy, a browser with third-party requests off) is the common case, not the
 * exotic one.
 *
 * The whole module is therefore built around one helper: `safe`.
 */
function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    /* Deliberately silent. Nothing measured is worth a broken step. */
  }
}

/** The client, once it has loaded. Null until then, and null forever if unset. */
type PostHogClient = {
  capture: (event: string, props?: Props) => void;
  identify: (id: string, props?: Props) => void;
  register: (props: Props) => void;
  reset: () => void;
};

let client: PostHogClient | null = null;
let started = false;

/** Queued events from before the script finished loading. */
const pending: Array<{ event: string; props: Props }> = [];

export function analyticsKey(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ?? '';
}

export function analyticsHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com';
}

/** Whether anything at all should be sent. A blank key means no. */
export function analyticsEnabled(): boolean {
  return analyticsKey() !== '';
}

/**
 * Start PostHog, at most once.
 *
 * Imported dynamically so the library is not in the first bundle the customer
 * downloads on a phone, and so a blank key costs nothing at all — the import
 * never runs.
 */
export function startAnalytics(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  if (!analyticsEnabled()) return;

  safe(() => {
    void import('posthog-js')
      .then(({ default: posthog }) => {
        posthog.init(analyticsKey(), {
          api_host: analyticsHost(),
          // Autocapture on, as asked: clicks and form interactions land without
          // a call site, which is what makes rage-click reporting possible.
          autocapture: true,
          capture_pageview: true,
          capture_pageleave: true,
          disable_session_recording: false,
          session_recording: {
            /*
              Every input masked, without exception.

              This funnel collects a name, an email, a phone number and a
              street address, and a session replay is a video of somebody
              typing them. maskAllInputs alone leaves the text of the page, so
              the confirmed address and the quote figures are masked by class
              too — see .gm-mask on the contact step.
            */
            maskAllInputs: true,
            maskTextSelector: '.gm-mask',
          },
          persistence: 'localStorage+cookie',
          // The funnel decides when a person becomes identifiable, and that is
          // when a lead id exists — not on first page view.
          person_profiles: 'identified_only',
        });
        client = posthog as unknown as PostHogClient;

        // Whatever the URL said, on every event from here on.
        const utm = utmFromSearch(window.location.search);
        const source = new URLSearchParams(window.location.search).get('source');
        client.register({ ...utm, ...(source ? { source } : {}) });

        for (const queued of pending.splice(0)) {
          safe(() => client?.capture(queued.event, queued.props));
        }
      })
      .catch(() => {
        // Blocked, offline, or removed by an extension. Nothing to do.
      });
  });
}

/** Attach the lead id, so a funnel can be followed across steps and devices. */
export function identify(leadId: string): void {
  if (!leadId || !analyticsEnabled()) return;
  safe(() => client?.identify(leadId));
}

/**
 * Send one event.
 *
 * Step and lead id ride on every event, read from the store at call time so no
 * call site has to pass them and none can pass a stale one.
 */
export function track(event: AnalyticsEvent, props: Props = {}): void {
  if (!analyticsEnabled()) return;
  safe(() => {
    const s = useQuoteStore.getState();
    const enriched = {
      ...props,
      step: s.currentStepIndex,
      leadId: s.leadId ?? null,
    };
    if (client) client.capture(event, enriched);
    // Before the library has loaded, hold it rather than drop it: the first
    // two steps of the funnel happen inside that window on a slow phone.
    else if (pending.length < 50) pending.push({ event, props: enriched });
  });
}

/**
 * The Meta pixel's view of the same journey.
 *
 * Deliberately thin: one ViewContent per step and one Lead at the end. The
 * pixel is already loaded in the root layout and `fbqSafe` queues until it is
 * ready, so this cannot throw before the script lands either.
 */
export function trackStepView(step: number): void {
  track('step_viewed', { step });
  safe(() => fbqSafe('track', 'ViewContent', { content_name: `step-${step}` }));
}

/**
 * The lead, on both. `eventId` is shared with the server's Conversions API
 * call so Meta counts one conversion rather than two.
 */
export function trackLeadFiled(eventId: string, props: Props = {}): void {
  track('lead_filed', { ...props, eventId });
  safe(() => fbqSafe('track', 'Lead', { value: props.value ?? 0, currency: 'USD' }, { eventID: eventId }));
}

/** Test seam: forget the client and the queue between cases. */
export function __resetAnalytics(): void {
  client = null;
  started = false;
  pending.length = 0;
}
