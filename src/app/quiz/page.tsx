'use client';

import { Suspense } from 'react';
import QuizContent from './QuizContent';
import ErrorBoundary from '@/components/common/ErrorBoundary';

export default function QuizPage() {

  return (
    <ErrorBoundary>
      <Suspense fallback={
        <div className="bg-white p-4 rounded-lg shadow-lg animate-pulse">
          <div className="h-10 bg-gray-200 rounded w-full"></div>
        </div>
      }>
        <QuizContent />
      </Suspense>
    </ErrorBoundary>
  );
} 