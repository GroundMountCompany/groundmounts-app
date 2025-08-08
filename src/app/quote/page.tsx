'use client'

import { QuoteContextProvider } from '@/contexts/quoteContextProvider';
import { PageContainer } from './pageContainer';
import ErrorBoundary from '@/components/common/ErrorBoundary';

export default function QuotePage() {

  return (
    <ErrorBoundary>
      <QuoteContextProvider>
        <main className="bg-white max-w-7xl mx-auto px-4 py-[64px] lg:px-10 lg:py-[80px]">
          <PageContainer />
        </main>
      </QuoteContextProvider>
    </ErrorBoundary>
  );
}

