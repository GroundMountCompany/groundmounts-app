'use client';

import { useState } from 'react';
import Button from '@/components/common/Button';
import { twMerge } from 'tailwind-merge';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { defaultRevealY } from '@/constants/animation';

const STATES = [
  'Texas', 'Oklahoma', 'Kansas', 'Nebraska', 'Arkansas', 'Louisiana',
  'Missouri', 'Mississippi', 'Alabama', 'Georgia', 'South Carolina',
  'Tennessee', 'Kentucky', 'Indiana', 'Ohio', 'North Carolina',
  'Florida', 'Illinois', 'Iowa'
];

interface Props {
  className?: string;
  selectClassName?: string;
  buttonClassName?: string;
}

export default function StateDropdown({
  className,
  selectClassName,
  buttonClassName
}: Props) {
  const defaultClass =
    'flex flex-row items-center lg:justify-between mt-4 bg-white rounded-full p-2 pl-6 shadow-md border border-neutral-200 w-full lg:w-[540px]';
  const defaultSelect =
    'w-1/2 lg:w-auto shrink grow-0 lg:shrink-0 lg:grow outline-none pr-2 text-base lg:text-lg text-neutral-500';
  const defaultButton =
    'text-base lg:text-lg grow shrink-0 lg:grow-0 lg:shrink capitalize lg:normal-case px-[12px] lg:px-6';

  const [selectedState, setSelectedState] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleGetQuote = () => {
    if (!selectedState) return;
    setIsSubmitting(true);

    /* ---------- Meta Lead ---------- */
    if (typeof window !== 'undefined' && (window as any).fbq) {
      const params = new URLSearchParams(window.location.search);
      const testCode = params.get('test_event_code');           // <- present only when Test-events tab opened
      const options = testCode ? { eventID: testCode } : {};
      (window as any).fbq('track', 'Lead', {}, options);
    }
    /* -------------------------------- */

    router.push(`/quiz?state=${encodeURIComponent(selectedState)}`);
  };

  return (
    <motion.div {...defaultRevealY} className={twMerge(defaultClass, className)}>
      <select
        value={selectedState}
        onChange={e => setSelectedState(e.target.value)}
        className={twMerge(defaultSelect, selectClassName)}
      >
        <option value="">Select State</option>
        {STATES.map(state => (
          <option key={state} value={state}>
            {state}
          </option>
        ))}
      </select>

      <Button
        type="secondary"
        size="big"
        className={twMerge(defaultButton, buttonClassName)}
        onClick={handleGetQuote}
        disabled={isSubmitting || !selectedState}
      >
        {isSubmitting ? 'Processing…' : 'Get a free quote'}
      </Button>
    </motion.div>
  );
}
