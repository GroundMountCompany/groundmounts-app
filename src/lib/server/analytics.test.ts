import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { metaLead } from './analytics';

/** What the Conversions API call carried, as Meta would read it. */
function sentUserData(fetchSpy: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
  return body.data[0].user_data;
}

describe('metaLead user_data', () => {
  const original = process.env.META_CAPI_TOKEN;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.META_CAPI_TOKEN = 'test-token';
    fetchSpy = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => {
    if (original === undefined) delete process.env.META_CAPI_TOKEN;
    else process.env.META_CAPI_TOKEN = original;
    vi.unstubAllGlobals();
  });

  it('carries the click id, IP and user agent, unhashed, when present', async () => {
    await metaLead('lead-1', {
      email: 'Someone@Example.com',
      fbc: 'fb.1.1790000000000.clickA',
      clientIp: '198.51.100.7',
      userAgent: 'Mozilla/5.0 (iPhone)',
    });
    const userData = sentUserData(fetchSpy);
    expect(userData.fbc).toBe('fb.1.1790000000000.clickA');
    expect(userData.client_ip_address).toBe('198.51.100.7');
    expect(userData.client_user_agent).toBe('Mozilla/5.0 (iPhone)');
    // Contact details are still hashed.
    expect(userData.em).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is unchanged from before when none of them is known', async () => {
    await metaLead('lead-1', { email: 'someone@example.com', phone: '469-555-0100' });
    expect(Object.keys(sentUserData(fetchSpy)).sort()).toEqual(['em', 'ph']);
  });

  it('sends nothing without a token', async () => {
    process.env.META_CAPI_TOKEN = '';
    await metaLead('lead-1', { fbc: 'fb.1.1790000000000.clickA' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
