import { twMerge } from "tailwind-merge";
import { type ClassValue, clsx } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const updateSheet = async (column: string, value: string, cb?: () => void) => {
  let leadId = '';
  if (typeof window !== 'undefined') {
    leadId = localStorage.getItem('lead_id') || '';
    if (!leadId) {
      const timestamp = new Date().getTime();
      const randomNum = Math.floor(Math.random() * 1000000);
      leadId = `LEAD_${timestamp}_${randomNum}`;
      localStorage.setItem('lead_id', leadId);
    }
  }
  try {
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tabName: 'Sheet1', leadId, column, value }),
    });

    if (!response.ok) {
      throw new Error('Failed to update sheet with leadId');
    }
    cb && cb()

  } catch (error) {
    console.error('Error updating sheet with leadId:', error);
  }
};