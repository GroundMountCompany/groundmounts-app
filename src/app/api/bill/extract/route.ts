import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, rateLimitOkAsync } from '@/lib/guard';
import { sniffUpload } from '@/lib/fileSniff';
import { ANTHROPIC, ANTHROPIC_URL } from '@/config/apis';
import {
  BILL_PROMPT,
  BILL_TOOL_NAME,
  BILL_TOOL_SCHEMA,
  sanitiseExtraction,
  type BillExtraction,
} from '@/lib/billSchema';

/**
 * Read a customer's electricity bill.
 *
 * Every failure here goes back to typing the number in by hand, so nothing in
 * this route is allowed to be a dead end. It returns a usable answer or a plain
 * reason, never a retry loop.
 *
 * The file is held in memory for exactly one API call and dropped. It is never
 * written to disk, never uploaded to Blob storage, and never logged — a
 * utility bill has the customer's name, address and account number on it, and
 * the safest place for a document we only need for thirty seconds is nowhere.
 */

/** Anything larger is a photo of a wall, not a legible bill. */
const MAX_BYTES = 10 * 1024 * 1024;

export interface BillExtractResponse {
  ok: boolean;
  extraction?: BillExtraction;
  /** Shown to the customer verbatim when present. */
  reason?: string;
}

const CANNOT_READ = "Couldn't read that one. Type it in instead.";

function refuse(reason: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, reason }, { status });
}

export async function POST(req: NextRequest) {
  if (!(await rateLimitOkAsync(getClientIp(req), 'bill-extract'))) {
    return refuse('Too many uploads just now. Type it in instead.', 429);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[BILL_EXTRACT] ANTHROPIC_API_KEY missing');
    return refuse(CANNOT_READ, 503);
  }

  let bytes: Buffer;
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof Blob)) return refuse('No file arrived. Try again, or type it in.', 400);

    // Checked before the buffer is allocated: an oversized upload should cost
    // as little as possible.
    if (file.size > MAX_BYTES) {
      return refuse('That file is too big. Try a photo instead, or type it in.', 413);
    }

    bytes = Buffer.from(await file.arrayBuffer());
  } catch {
    return refuse(CANNOT_READ, 400);
  }

  if (bytes.length > MAX_BYTES) {
    return refuse('That file is too big. Try a photo instead, or type it in.', 413);
  }

  const sniffed = sniffUpload(bytes);
  if (sniffed.kind === 'heic') {
    // iPhones shoot HEIC by default, so this is worth its own sentence rather
    // than a generic failure the customer cannot act on.
    return refuse(
      'That photo is in a format we cannot read yet. Take a screenshot of it, or type it in.',
      415
    );
  }
  if (!sniffed.mediaType) {
    return refuse('That does not look like a bill. Try a photo or PDF, or type it in.', 415);
  }

  console.log('[BILL_EXTRACT] received', sniffed.kind, Math.round(bytes.length / 1024), 'KB');

  const base64 = bytes.toString('base64');
  const source = { type: 'base64' as const, media_type: sniffed.mediaType, data: base64 };
  const content =
    sniffed.kind === 'pdf'
      ? [{ type: 'document', source }, { type: 'text', text: BILL_PROMPT }]
      : [{ type: 'image', source }, { type: 'text', text: BILL_PROMPT }];

  let json: {
    content?: Array<{ type: string; name?: string; input?: unknown }>;
    stop_reason?: string;
  };

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC.version,
      },
      body: JSON.stringify({
        model: ANTHROPIC.model,
        max_tokens: ANTHROPIC.maxTokens,
        // Forced: the answer must be a validated object, not a paragraph
        // describing one.
        tool_choice: { type: 'tool', name: BILL_TOOL_NAME },
        tools: [
          {
            name: BILL_TOOL_NAME,
            description: 'Record the usage and rate read from an electricity bill.',
            input_schema: BILL_TOOL_SCHEMA,
          },
        ],
        messages: [{ role: 'user', content }],
      }),
      signal: AbortSignal.timeout(ANTHROPIC.timeoutMs),
    });

    if (!res.ok) {
      // The body can quote the document back; log the status only.
      console.warn('[BILL_EXTRACT] anthropic returned', res.status);
      return refuse(CANNOT_READ, 502);
    }

    json = await res.json();
  } catch (error) {
    // Includes the 20 s timeout. A customer who has waited that long wants a
    // keyboard, not another spinner.
    console.warn(
      '[BILL_EXTRACT] anthropic unavailable:',
      error instanceof Error ? error.message : error
    );
    return refuse(CANNOT_READ, 504);
  }

  const call = json.content?.find((block) => block.type === 'tool_use' && block.name === BILL_TOOL_NAME);
  if (!call) {
    console.warn('[BILL_EXTRACT] no tool call in response');
    return refuse(CANNOT_READ, 502);
  }

  // Rebuilt from the fields we asked for, so anything volunteered beyond them
  // never reaches a log, a response or a database.
  const extraction = sanitiseExtraction(call.input);

  if (extraction.confidence === 'low' || extraction.months.length === 0) {
    console.log('[BILL_EXTRACT] unusable:', extraction.confidence, extraction.months.length, 'months');
    return refuse(CANNOT_READ, 422);
  }

  // Counts only. The figures themselves belong to the customer.
  console.log('[BILL_EXTRACT] extracted', extraction.months.length, 'months');

  return NextResponse.json({ ok: true, extraction });
}
