interface Window {
  fbq: (
    type: 'init' | 'track' | 'trackCustom',
    eventName: string,
    params?: Record<string, any>,
    options?: { eventID?: string }
  ) => void;
} 