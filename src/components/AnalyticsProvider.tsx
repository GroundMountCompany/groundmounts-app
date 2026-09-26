'use client';

import { useEffect } from 'react';
import { useQuoteStore } from '@/store/quoteStore';
import { identify, startAnalytics, utmFromSearch } from '@/lib/analytics';
import { internalCookieFor } from '@/lib/internalVisit';
import { fbcFromSearch } from '@/lib/utm';

/**
 * Start analytics, and keep the person attached to their lead.
 *
 * Renders nothing. It exists so the two things that have to happen exactly
 * once — booting the library and reading the UTM parameters off the landing
 * URL — happen in one place with a lifecycle, rather than at import time where
 * they would run during SSR and on every hot reload.
 */
export default function AnalyticsProvider() {
  const leadId = useQuoteStore((s) => s.leadId);
  const setUtm = useQuoteStore((s) => s.setUtm);
  const setFbc = useQuoteStore((s) => s.setFbc);

  useEffect(() => {
    startAnalytics();

    /*
      Read from the landing URL and kept.

      The parameters are stripped from the URL as the funnel advances (see
      useStepUrl), and a customer who takes twenty minutes over a design may
      well reload. Storing them means the campaign that produced the lead is
      still on the lead when it is finally filed, rather than only on the first
      pageview.
    */
    const utm = utmFromSearch(window.location.search);
    if (Object.keys(utm).length > 0) setUtm(utm);
    // Meta's click id, kept the same way for the server's Lead (see lib/utm).
    const fbc = fbcFromSearch(window.location.search, Date.now());
    if (fbc) setFbc(fbc);

    // `?internal=1` marks this browser as the owner's, so its leads file as
    // tests. A cookie rather than the store, because the server decides.
    const cookie = internalCookieFor(window.location.search, window.location.protocol === 'https:');
    if (cookie) document.cookie = cookie;
  }, [setUtm, setFbc]);

  // A lead id appears partway through, so this cannot be done once on mount.
  useEffect(() => {
    if (leadId) identify(leadId);
  }, [leadId]);

  return null;
}
