'use client';

import { useState } from 'react';
import Button from "@/components/common/Button";
import { twMerge } from 'tailwind-merge';
import { ZipcodeInputProps } from '@/types';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { defaultRevealY } from '@/constants/animation';

export default function ZipcodeInput({
  className,
  inputClassName,
  buttonClassName
}: ZipcodeInputProps) {

  const defaultClassName = "flex flex-row items-center lg:justify-between mt-4 bg-white rounded-full p-2 pl-6 shadow-md border border-neutral-200 w-full lg:w-[540px]";
  const defaultInputClassName = "w-1/2 lg:w-auto shrink grow-0 lg:shrink-0 lg:grow outline-none pr-2 text-base lg:text-lg text-neutral-500";
  const defaultButtonClassName = "text-base lg:text-lg grow shrink-0 lg:grow-0 lg:shrink capitalize lg:normal-case px-[12px] lg:px-6";

  const [zipcode, setZipcode] = useState<string>('');
  const router = useRouter();

  const handleGetQuote = (): void => {
    if (zipcode) {
      router.push(`/quote?zipcode=${zipcode}`);
    }
  };
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!/^\d*$/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Tab') {
      e.preventDefault();
    }
    if (e.key === 'Enter') {
      handleGetQuote();
    }
  };

  return (
    <motion.div {...defaultRevealY} className={twMerge(defaultClassName, className)}>
      <input
        type="tel"
        placeholder="Enter Zipcode"
        value={zipcode}
        onChange={(e) => setZipcode(e.target.value)}
        onKeyDown={handleKeyPress}
        className={twMerge(defaultInputClassName, inputClassName)}
      />
      <Button
        type="secondary"
        size="big"
        className={twMerge(defaultButtonClassName, buttonClassName)}
        onClick={handleGetQuote}
      >
        Get a free quote
      </Button>
    </motion.div>
  );
}
