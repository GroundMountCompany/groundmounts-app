'use client'

import { useEffect } from 'react';
import { QuoteContextProvider } from '@/contexts/quoteContextProvider';
import { PageContainer } from './pageContainer';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { initLeadQueue } from '@/lib/leadQueue';

export default function QuotePage() {
  useEffect(() => { 
    initLeadQueue(); 
  }, []);

  return (
    <ErrorBoundary>
      <QuoteContextProvider>
        <main className="bg-white h-[100dvh] md:h-auto md:max-w-7xl md:mx-auto md:px-4 md:py-[64px] lg:px-10 lg:py-[80px] overflow-hidden md:overflow-visible">
          <PageContainer />
        </main>
      </QuoteContextProvider>
    </ErrorBoundary>
  );
}

