interface Window {
  fbq: (
    type: 'init' | 'track' | 'trackCustom',
    eventName: string,
    params?: Record<string, unknown>,
    options?: { eventID?: string }
  ) => void;
} 