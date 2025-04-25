import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function debounce<T extends (...args: unknown[]) => void>(func: T, delay: number): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
}

export function formatNumber(
  value: number | string,
  separator: ',' | '.' = ',',
): string {
  // Convert to string and remove any existing non-digit characters
  const numStr = value.toString().replace(/\D/g, '');

  // Add separator for every 3 digits from right
  const pattern = /(\d)(?=(\d{3})+(?!\d))/g;
  return numStr.replace(pattern, `$1${separator}`);
}
