'use client';

import { useState } from 'react';
import Button from "@/components/common/Button";
import { twMerge } from 'tailwind-merge';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { defaultRevealY } from '@/constants/animation';

const STATES = [
  'Texas',
  'Oklahoma',
  'Kansas',
  'Nebraska',
  'Arkansas',
  'Louisiana',
  'Missouri',
  'Mississippi',
  'Alabama',
  'Georgia',
  'South Carolina',
  'Tennessee',
  'Kentucky',
  'Indiana',
  'Ohio',
  'North Carolina',
  'Florida',
  'Illinois',
  'Iowa'
];

interface StateDropdownProps {
  className?: string;
  selectClassName?: string;
  buttonClassName?: string;
}

export default function StateDropdown({
  className,
  selectClassName,
  buttonClassName
}: StateDropdownProps) {
  const defaultClassName = "flex flex-row items-center lg:justify-between mt-4 bg-white rounded-full p-2 pl-6 shadow-md border border-neutral-200 w-full lg:w-[540px]";
  const defaultSelectClassName = "w-1/2 lg:w-auto shrink grow-0 lg:shrink-0 lg:grow outline-none pr-2 text-base lg:text-lg text-neutral-500";
  const defaultButtonClassName = "text-base lg:text-lg grow shrink-0 lg:grow-0 lg:shrink capitalize lg:normal-case px-[12px] lg:px-6";

  const [selectedState, setSelectedState] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const router = useRouter();

  const handleGetQuote = async (): Promise<void> => {
    if (selectedState) {
      setIsSubmitting(true);
      try {
        // Submit to Google Sheets
        // const response = await fetch('/api/submit', {
        //   method: 'POST',
        //   headers: {
        //     'Content-Type': 'application/json',
        //   },
        //   body: JSON.stringify({ state: selectedState }),
        // });

        // if (!response.ok) {
        //   throw new Error('Failed to submit data');
        // }

        // Navigate to the quiz page instead of the quote page
        router.push(`/quiz?state=${encodeURIComponent(selectedState)}`);
      } catch (error) {
        console.error('Error:', error);
        setIsSubmitting(false);
      }
    }
  };

  return (
    <motion.div {...defaultRevealY} className={twMerge(defaultClassName, className)}>
      <select
        value={selectedState}
        onChange={(e) => setSelectedState(e.target.value)}
        className={twMerge(defaultSelectClassName, selectClassName)}
      >
        <option value="">Select State</option>
        {STATES.map((state) => (
          <option key={state} value={state}>
            {state}
          </option>
        ))}
      </select>
      <Button
        type="secondary"
        size="big"
        className={twMerge(defaultButtonClassName, buttonClassName)}
        onClick={handleGetQuote}
        disabled={isSubmitting || !selectedState}
      >
        {isSubmitting ? 'Processing...' : 'Get a free quote'}
      </Button>
    </motion.div>
  );
}