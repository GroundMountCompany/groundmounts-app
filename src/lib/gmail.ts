// src/lib/gmail.ts
// Gmail API functionality - currently disabled
// TODO: Re-implement if Gmail integration is needed (requires googleapis package)

export function getOAuth2Client() {
  throw new Error('Gmail API is not currently configured');
}

export function getAuthUrl(): string {
  throw new Error('Gmail API is not currently configured');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getTokens(code: string) {
  throw new Error('Gmail API is not currently configured');
}

export function getAuthenticatedClient() {
  throw new Error('Gmail API is not currently configured');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function listMessages(query: string = '') {
  console.log('[GMAIL_DISABLED] Gmail API not configured');
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getMessage(messageId: string): Promise<{ payload?: { headers?: Array<{ name?: string; value?: string }> }; snippet?: string } | null> {
  console.log('[GMAIL_DISABLED] Gmail API not configured');
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function checkForReplies(sinceDate: Date): Promise<Array<{ id?: string; subject?: string; from?: string; snippet?: string; internalDate?: string }>> {
  console.log('[GMAIL_DISABLED] Gmail API not configured');
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function markAsRead(messageId: string) {
  console.log('[GMAIL_DISABLED] Gmail API not configured');
}
