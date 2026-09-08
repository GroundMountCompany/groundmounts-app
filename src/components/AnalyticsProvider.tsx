'use client';

import { useEffect } from 'react';
import { useQuoteStore } from '@/store/quoteStore';
import { identify, startAnalytics, utmFromSearch } from '@/lib/analytics';

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
  }, [setUtm]);

  // A lead id appears partway through, so this cannot be done once on mount.
  useEffect(() => {
    if (leadId) identify(leadId);
  }, [leadId]);

  return null;
}
