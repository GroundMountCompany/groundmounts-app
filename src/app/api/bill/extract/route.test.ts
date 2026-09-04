import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { __resetRateLimits } from '@/lib/guard';
import { BILL_TOOL_NAME } from '@/lib/billSchema';
import { ANTHROPIC } from '@/config/apis';

/**
 * Reading a bill, and every way it can fail.
 *
 * The rule this suite exists to hold: there is no dead end. Whatever goes
 * wrong, the customer is told to type it in, and the manual path is untouched.
 */

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 7),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 7)]);
const HEIC = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from('ftypheic'),
  Buffer.alloc(64, 7),
]);
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(64, 7)]);

function upload(bytes: Buffer, filename = 'bill.png'): NextRequest {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)]), filename);
  return new NextRequest('http://localhost/api/bill/extract', {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.11' },
    body: form,
  });
}

/** What Anthropic returns for a bill it could read. */
const toolResponse = (input: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({
    content: [{ type: 'tool_use', name: BILL_TOOL_NAME, input }],
    stop_reason: 'tool_use',
  }),
});

const GOOD_BILL = {
  months: [
    { month: 'Jan 2026', kwh: 1450, cost: 203.5 },
    { month: 'Dec 2025', kwh: 1310, cost: 188.2 },
  ],
  ratePerKwh: 0.17,
  confidence: 'high',
};

let anthropicCalls: Array<{ url: string; body: Record<string, unknown> }> = [];

function anthropic(handler: () => unknown) {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    anthropicCalls.push({ url, body: JSON.parse(String(init.body)) });
    const result = handler();
    if (result instanceof Error) throw result;
    return result as Response;
  });
}

beforeEach(() => {
  __resetRateLimits();
  anthropicCalls = [];
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('POST /api/bill/extract', () => {
  it('returns the months it read from a photo', async () => {
    anthropic(() => toolResponse(GOOD_BILL));

    const res = await POST(upload(JPEG, 'bill.jpg'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.extraction.months).toHaveLength(2);
    expect(body.extraction.months[0]).toEqual({ month: 'Jan 2026', kwh: 1450, cost: 203.5 });
    expect(body.extraction.ratePerKwh).toBe(0.17);
  });

  it('forces the tool call rather than hoping for JSON in prose', async () => {
    anthropic(() => toolResponse(GOOD_BILL));
    await POST(upload(JPEG, 'bill.jpg'));

    const sent = anthropicCalls[0];
    expect(sent.url).toContain(ANTHROPIC.host);
    expect(sent.body.model).toBe(ANTHROPIC.model);
    expect(sent.body.tool_choice).toEqual({ type: 'tool', name: BILL_TOOL_NAME });
    expect((sent.body.tools as Array<{ name: string }>)[0].name).toBe(BILL_TOOL_NAME);
  });

  it('sends a PDF as a document and an image as an image', async () => {
    anthropic(() => toolResponse(GOOD_BILL));
    await POST(upload(PDF, 'bill.pdf'));
    const pdfBlocks = (
      (anthropicCalls[0].body.messages as Array<{ content: Array<{ type: string }> }>)[0].content
    ).map((b) => b.type);
    expect(pdfBlocks).toContain('document');

    __resetRateLimits();
    anthropicCalls = [];
    await POST(upload(PNG));
    const imageBlocks = (
      (anthropicCalls[0].body.messages as Array<{ content: Array<{ type: string }> }>)[0].content
    ).map((b) => b.type);
    expect(imageBlocks).toContain('image');
  });

  it('sends the customer to the keyboard when confidence is low', async () => {
    anthropic(() => toolResponse({ ...GOOD_BILL, confidence: 'low' }));

    const res = await POST(upload(JPEG, 'bill.jpg'));

    expect(res.status).toBe(422);
    expect((await res.json()).reason).toBe("Couldn't read that one. Type it in instead.");
  });

  it('does the same when it finds no months at all', async () => {
    // A photo of a cat, essentially.
    anthropic(() => toolResponse({ months: [], ratePerKwh: null, confidence: 'high' }));

    const res = await POST(upload(JPEG, 'bill.jpg'));
    expect(res.status).toBe(422);
    expect((await res.json()).reason).toBe("Couldn't read that one. Type it in instead.");
  });

  it('does the same when the call times out', async () => {
    anthropic(() => new Error('The operation was aborted due to timeout'));

    const res = await POST(upload(JPEG, 'bill.jpg'));

    expect(res.status).toBe(504);
    expect((await res.json()).reason).toBe("Couldn't read that one. Type it in instead.");
  });

  it('does the same when Anthropic returns an error', async () => {
    anthropic(() => ({ ok: false, status: 500, json: async () => ({}) }));

    const res = await POST(upload(JPEG, 'bill.jpg'));
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toContain('Type it in');
  });

  it('refuses a file that is too big without calling anybody', async () => {
    anthropic(() => toolResponse(GOOD_BILL));

    const res = await POST(upload(Buffer.alloc(11 * 1024 * 1024, 1), 'huge.png'));

    expect(res.status).toBe(413);
    expect((await res.json()).reason).toContain('too big');
    expect(anthropicCalls, 'an oversized file was sent upstream').toHaveLength(0);
  });

  it('names HEIC specifically, because iPhones shoot it by default', async () => {
    anthropic(() => toolResponse(GOOD_BILL));

    const res = await POST(upload(HEIC, 'IMG_0001.heic'));
    const body = await res.json();

    expect(res.status).toBe(415);
    expect(body.reason).toContain('screenshot');
    expect(anthropicCalls).toHaveLength(0);
  });

  it('refuses a file type it cannot read, whatever the name says', async () => {
    anthropic(() => toolResponse(GOOD_BILL));

    // Called bill.png; actually a GIF. The bytes decide.
    const res = await POST(upload(GIF, 'bill.png'));

    expect(res.status).toBe(415);
    expect(anthropicCalls, 'an unrecognised file was sent upstream').toHaveLength(0);
  });

  it('drops anything the model volunteered beyond the schema', async () => {
    // Belt and braces over the prompt and the schema: whatever comes back, the
    // response is rebuilt from the fields we asked for.
    anthropic(() =>
      toolResponse({
        ...GOOD_BILL,
        accountNumber: '4455-9982',
        customerName: 'Bert Ortiz',
        serviceAddress: '123 Main St, Fort Worth TX',
        months: [
          { month: 'Jan 2026', kwh: 1450, cost: 203.5, meterNumber: 'M-8891' },
        ],
      })
    );

    const res = await POST(upload(JPEG, 'bill.jpg'));
    const serialised = JSON.stringify(await res.json());

    for (const leaked of ['4455-9982', 'Bert Ortiz', '123 Main St', 'M-8891']) {
      expect(serialised, `the response carried ${leaked}`).not.toContain(leaked);
    }
    expect(serialised).toContain('1450');
  });

  it('says so plainly when no key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    anthropic(() => toolResponse(GOOD_BILL));

    const res = await POST(upload(JPEG, 'bill.jpg'));

    expect(res.status).toBe(503);
    expect((await res.json()).reason).toContain('Type it in');
    expect(anthropicCalls).toHaveLength(0);
  });

  it('rate limits, and still tells the customer what to do', async () => {
    anthropic(() => toolResponse(GOOD_BILL));
    for (let i = 0; i < 10; i++) await POST(upload(JPEG, 'bill.jpg'));

    const res = await POST(upload(JPEG, 'bill.jpg'));
    expect(res.status).toBe(429);
    expect((await res.json()).reason).toContain('Type it in');
  });
});
