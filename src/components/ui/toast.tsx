import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  duration?: number;
  onClose: () => void;
}

export const Toast = ({ message, type = 'success', duration = 3000, onClose }: ToastProps) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Wait for fade out animation
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return createPortal(
    <div
      className={cn(
        "fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 transition-all duration-300",
        {
          "bg-[#F0F6FF] border border-[#638ED2] text-custom-primary": type === 'success',
          "bg-red-50 border border-red-200 text-red-600": type === 'error',
          "translate-x-0 opacity-100": isVisible,
          "translate-x-full opacity-0": !isVisible
        }
      )}
      role="alert"
    >
      {type === 'success' ? (
        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 0C4.49 0 0 4.49 0 10C0 15.51 4.49 20 10 20C15.51 20 20 15.51 20 10C20 4.49 15.51 0 10 0ZM14.78 7.7L9.11 13.37C8.97 13.51 8.78 13.59 8.58 13.59C8.38 13.59 8.19 13.51 8.05 13.37L5.22 10.54C4.93 10.25 4.93 9.77 5.22 9.48C5.51 9.19 5.99 9.19 6.28 9.48L8.58 11.78L13.72 6.64C14.01 6.35 14.49 6.35 14.78 6.64C15.07 6.93 15.07 7.4 14.78 7.7Z" fill="currentColor"/>
        </svg>
      ) : (
        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 0C4.49 0 0 4.49 0 10C0 15.51 4.49 20 10 20C15.51 20 20 15.51 20 10C20 4.49 15.51 0 10 0ZM10 11C9.59 11 9.25 10.66 9.25 10.25V6C9.25 5.59 9.59 5.25 10 5.25C10.41 5.25 10.75 5.59 10.75 6V10.25C10.75 10.66 10.41 11 10 11ZM10.92 14.88C10.87 15 10.8 15.11 10.71 15.21C10.61 15.3 10.5 15.37 10.38 15.42C10.26 15.47 10.13 15.5 10 15.5C9.87 15.5 9.74 15.47 9.62 15.42C9.5 15.37 9.39 15.3 9.29 15.21C9.2 15.11 9.13 15 9.08 14.88C9.03 14.76 9 14.63 9 14.5C9 14.37 9.03 14.24 9.08 14.12C9.13 14 9.2 13.89 9.29 13.79C9.39 13.7 9.5 13.63 9.62 13.58C9.86 13.48 10.14 13.48 10.38 13.58C10.5 13.63 10.61 13.7 10.71 13.79C10.8 13.89 10.87 14 10.92 14.12C10.97 14.24 11 14.37 11 14.5C11 14.63 10.97 14.76 10.92 14.88Z" fill="currentColor"/>
        </svg>
      )}
      <p className="text-sm font-medium">{message}</p>
    </div>,
    document.body
  );
};

interface ToastState {
  message: string;
  type: 'success' | 'error';
}

export const useToast = () => {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  const hideToast = () => {
    setToast(null);
  };

  return {
    Toast: toast ? <Toast {...toast} onClose={hideToast} /> : null,
    showToast,
    hideToast
  };
}; 
