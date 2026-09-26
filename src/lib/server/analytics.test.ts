import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { metaLead } from './analytics';

/** A lead Meta refused has to show up in the logs, and still never throw. */
describe('metaLead', () => {
  const original = process.env.META_CAPI_TOKEN;
  beforeEach(() => {
    process.env.META_CAPI_TOKEN = 'test-token';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.META_CAPI_TOKEN;
    else process.env.META_CAPI_TOKEN = original;
    vi.restoreAllMocks();
  });

  it('logs a rejected event instead of treating it as delivered', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":{"message":"Invalid OAuth access token"}}', { status: 400 }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(metaLead('lead-1', { email: 'a@b.co' })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith('[META_CAPI_FAILED]', 400, expect.stringContaining('Invalid OAuth'));
  });

  it('logs a network failure and does not throw', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('socket hang up'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(metaLead('lead-1', {})).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith('[META_CAPI_FAILED]', 'socket hang up');
  });

  it('sends the dedup id, hashed contact details, and the raw IP and browser for matching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await metaLead('lead-1', { email: ' A@B.co ', ip: '203.0.113.9', userAgent: 'Mozilla/5.0' });
    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    const event = body.data[0];
    expect(event.event_id).toBe('lead-1');
    expect(event.user_data.em).toMatch(/^[a-f0-9]{64}$/);
    expect(event.user_data.client_ip_address).toBe('203.0.113.9');
    expect(event.user_data.client_user_agent).toBe('Mozilla/5.0');
  });

  it('does nothing without a token', async () => {
    delete process.env.META_CAPI_TOKEN;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await metaLead('lead-1', {});
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
