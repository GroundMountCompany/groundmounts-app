'use client';

import { cn } from '@/lib/utils';

/**
 * The one button that moves the funnel forward.
 *
 * 56px tall and full width: customers are 50+ and on phones, so the target is
 * deliberately larger than the 48px floor.
 */
export default function PrimaryButton({
  children,
  onClick,
  disabled,
  testId = 'primary-cta',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'h-14 w-full rounded-xl text-[17px] font-semibold shadow-sm transition active:scale-[.99]',
        disabled
          ? 'cursor-not-allowed bg-neutral-300 text-white'
          : 'bg-neutral-900 text-white hover:bg-neutral-800'
      )}
    >
      {children}
    </button>
  );
}
