'use client'

import { useEffect } from 'react';
import { QuoteContextProvider } from '@/contexts/quoteContextProvider';
import { PageContainer } from './quote/pageContainer';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { initLeadQueue } from '@/lib/leadQueue';

export default function Home() {
  useEffect(() => { 
    initLeadQueue(); 
  }, []);

  return (
    <ErrorBoundary>
      <QuoteContextProvider>
        <main className="bg-white min-h-screen md:max-w-7xl md:mx-auto md:px-4 md:py-[64px] lg:px-10 lg:py-[80px]">
          <PageContainer />
        </main>
      </QuoteContextProvider>
    </ErrorBoundary>
  );
}
