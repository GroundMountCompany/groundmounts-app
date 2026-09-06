import { NextRequest, NextResponse } from "next/server";
import { upsertLeadByLeadId, parseAddress, LeadFields } from "@/lib/airtable";
import { getClientIp, rateLimitOkAsync, isBotHoneypot, minTimeOk } from "@/lib/guard";
import { getResendOrThrow } from "@/lib/resendSafe";
import { put, del } from "@vercel/blob";
import { escapeHtml, escapeOr, headerSafe } from "@/lib/escape";
import { sanitiseExtraction } from "@/lib/billSchema";
import { sniffImage } from "@/lib/imageSniff";
import {
  parseQuoteInputs,
  priceFromInputs,
  buildableInputs,
  InvalidQuoteInputs,
} from "@/lib/quoteInputs";
import { siteFactsForArray, resolveSiteConditions } from "@/lib/server/siteLookup";
import EmailTemplate from "@/components/common/EmailTemplate";
import type { ReactElement } from "react";
import { brandFor } from "@/config/brands";
import type { SlopeAnswer } from "@/config/pricing";
import { RESULTS } from "@/config/results";
import { projectResults, type ResultsInput } from "@/lib/results";
import {
  storeGet,
  storeSet,
  acquireLease,
  releaseLease,
  StoreUnavailable,
} from "@/lib/server/redis";

/**
 * The twenty-five year comparison, from server figures only.
 *
 * The screen builds the same thing from the store; this rebuilds it from the
 * price the server actually computed, so the email cannot claim a payback for
 * a number nobody was quoted.
 */
function resultsFor(
  lead: LeadPayload,
  estimate: number,
  inflationPct: number
): ResultsInput | undefined {
  const bill = lead.quote?.avgBill;
  if (!bill || bill <= 0 || estimate <= 0) return undefined;
  return {
    monthlyBillUsd: bill,
    systemPriceUsd: estimate,
    offsetFraction: (lead.quote?.percentage ?? 100) / 100,
    inflationPct,
    startYear: new Date().getFullYear(),
  };
}

/** How the customer's slope answer reads in Airtable's single-select. */
const SLOPE_ANSWER_LABEL: Record<SlopeAnswer, string> = {
  flat: 'Flat',
  slight: 'Slight',
  big: 'Big',
};

/** Decoded screenshots above this are rejected rather than uploaded. */
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
/**
 * Base64 inflates by 4/3, so 2 MB decoded is ~2.8 MB encoded. Checking the
 * string length first means an oversized payload is rejected without allocating
 * a buffer for it.
 */
const MAX_SCREENSHOT_B64_CHARS = Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3) + 4;
/** Midpoint of a low/high pair, for the single-value legacy columns. */
function midpoint(low: number, high: number): number {
  return Math.round((low + high) / 2);
}

/**
 * Where new leads are announced. In env so the owner can change it without a
 * deploy, and without it being a code change nobody remembers how to make.
 */
const NOTIFICATION_EMAIL = process.env.NOTIFY_EMAIL || "bert@groundmounts.com";

/** How long a completed submit is remembered, so a repeat is a no-op. */
const SUBMIT_TTL_SECONDS = 24 * 60 * 60;
/**
 * How long one submit may hold the write.
 *
 * Long enough for Airtable and two emails, short enough that a process killed
 * mid-flight does not lock the customer out for the afternoon.
 */
const LEASE_TTL_SECONDS = 60;
const SUBMIT_PREFIX = "gm:submit:";
/** The only steps a partial may claim: address found, meter placed, design done. */
const PARTIAL_STEPS = [1, 3, 4];
const LEASE_PREFIX = "gm:submit:lease:";

/**
 * What a finished submit did, written only once the record exists.
 *
 * It carries the recipient and the quote as well as the reply, because a
 * resend has to reproduce the email from what the server stored rather than
 * from anything a later request says. Its presence is the answer to "has this
 * already happened?".
 */
interface SubmitRecord {
  ok: boolean;
  leadFiled: boolean;
  emailSent: boolean;
  priceLow: number;
  priceHigh: number;
  lineItems: Array<{ key: string; label: string; detail?: string; amount: number }>;
  airtableId?: string;
  /**
   * Whether the owner's "new lead" email went.
   *
   * Recorded because it can fail on its own, and a lead nobody was told about
   * is a lead nobody calls. Retried on the next resend or replay.
   */
  ownerNotified: boolean;
  /** What the owner's notification needs, so a retry does not re-derive it. */
  notifySubject?: string;
  notifyHtml?: string;
  /** Everything needed to send the email again, and nothing from the caller. */
  email: string;
  address: string;
  brand?: string;
  totalPanels: number;
  trenchFeet: number;
  systemSizeKw: number;
  annualProductionKwh: number;
  /**
   * The Blob URL of the design the customer drew.
   *
   * Stored so a resend produces the same email as the original rather than one
   * missing its picture — the upload happens once, before either send.
   */
  mapScreenshotUrl?: string;
  /** What the twenty-five year table said, so a resend says the same. */
  results?: ResultsInput;
  estimate: number;
}

/** The customer-facing half of a stored record. */
function replyFrom(record: SubmitRecord, extra: Record<string, unknown> = {}) {
  return {
    ok: record.ok,
    leadFiled: record.leadFiled,
    emailSent: record.emailSent,
    priceLow: record.priceLow,
    priceHigh: record.priceHigh,
    lineItems: record.lineItems,
    airtableId: record.airtableId,
    ownerNotified: record.ownerNotified,
    ...extra,
  };
}
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
// Airtable record deep links need the table *id* (tblXXXXXXXX), not its name.
// Without it we link to the base, which always resolves.
const AIRTABLE_TABLE_ID = process.env.AIRTABLE_TABLE_ID;

interface LeadPayload {
  id: string;
  /**
   * Send the customer's email again for a lead that is already filed.
   *
   * The one case where a second request is correct: the record was written and
   * the email was not. Skips the Airtable write entirely rather than trying to
   * be clever about duplicates.
   */
  resend?: boolean;
  state: string;
  email?: string;
  phone?: string;
  address?: string;
  name?: string;
  source?: string;
  /** Which brand the funnel wore. Attribution is `source`, and separate. */
  brand?: string;
  quote?: {
    /** What the price is computed from. Everything else here is context. */
    inputs?: unknown;
    totalPanels?: number;
    /** Trench run in feet, straight from the map. */
    trenchFeet?: number;
    azimuth?: number;
    percentage?: number;
    avgBill?: number;
    utilityInflationPct?: number;
    highBill?: number;
    billMonths?: Array<{ month: string; kwh: number; cost: number | null }> | null;
    billAnnualKwh?: number | null;
  };
  ts: number;
  honeypot?: string;
  ttc_ms?: number;
  mapScreenshot?: string;
}

/**
 * Longest anything a person types is allowed to be.
 *
 * Generous for a real name or address, and short enough that a hostile payload
 * cannot put a megabyte of text into the owner's Airtable or into the subject
 * line of an email that lands in their inbox.
 */
const MAX_TEXT = 200;
/**
 * A lead id is a UUID v4 and nothing else.
 *
 * It is the merge key on the owner's Airtable, the idempotency key on a
 * submit, and part of a Redis key. "8 to 64 characters" let a caller choose
 * `aaaaaaaa` and collide with somebody, or mint ids in a pattern. The client
 * has always generated a v4; now the server insists on one.
 */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isLeadId(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value);
}
/** "Jan 2026" and the like. Long enough for a date range, short enough to read. */
const MAX_MONTH_LABEL = 16;

function text(value: unknown, limit = MAX_TEXT): string {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

/**
 * A source is attribution, and attribution is a slug.
 *
 * It reaches Airtable and the owner reads it, so it may not be a sentence, a
 * script tag, or a kilobyte of anything. Unrecognisable input is dropped
 * rather than rejected: a bad campaign parameter should not cost somebody
 * their quote.
 */
function slug(value: unknown, limit = 64): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().toLowerCase().slice(0, limit);
  return /^[a-z0-9.-]+$/.test(trimmed) ? trimmed : undefined;
}

/** A resend carries an id. Everything else is read from the stored record. */
function validateResend(obj: Record<string, unknown>): LeadPayload {
  if (!isLeadId(obj.id)) {
    throw new InvalidEnvelope('Invalid lead ID');
  }
  return {
    id: obj.id,
    resend: true,
    state: '',
    email: '',
    phone: '',
    address: '',
    name: '',
    source: '',
    ts: 0,
  };
}

/** Thrown for an envelope that cannot be read, as opposed to a design that cannot be built. */
class InvalidEnvelope extends Error {}

/**
 * A number inside sane bounds, or undefined. Never NaN, never Infinity.
 *
 * Absence is checked before conversion because `Number(null)` is 0 and
 * `Number('')` is 0 — and JSON.stringify turns NaN into null on the way here,
 * so a field the client could not compute arrives looking like a legitimate
 * zero. That is the third time this trap has cost something in this codebase.
 */
function bounded(value: unknown, min: number, max: number): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

/**
 * The context around a quote: what they told us about their bill.
 *
 * None of it prices anything — that is all server-derived — but all of it
 * reaches the owner's Airtable and their notification email, so all of it is
 * bounded. A monthly bill of 10^9 dollars is not a customer.
 */
function validateContext(quote: unknown): LeadPayload['quote'] {
  const raw = (quote ?? {}) as Record<string, unknown>;

  // Run through the same sanitiser the extraction uses: twelve months, most
  // recent, labels trimmed, numbers bounded, and nothing else carried through.
  const bill = sanitiseExtraction({ months: raw.billMonths, confidence: 'high' });
  const billMonths = bill.months.map((m) => ({
    month: m.month.slice(0, MAX_MONTH_LABEL),
    kwh: m.kwh,
    cost: m.cost,
  }));

  return {
    inputs: raw.inputs,
    totalPanels: bounded(raw.totalPanels, 0, 2000),
    trenchFeet: bounded(raw.trenchFeet, 0, 20_000),
    azimuth: bounded(raw.azimuth, 0, 360),
    percentage: bounded(raw.percentage, 0, 200),
    avgBill: bounded(raw.avgBill, 0, 100_000),
    // Bounded to the slider's own range: this figure goes into the customer's
    // email and onto the record, so a payload claiming 400% a year must not
    // reach either.
    utilityInflationPct:
      bounded(raw.utilityInflationPct, RESULTS.inflationMinPct, RESULTS.inflationMaxPct) ??
      RESULTS.utilityInflationPct,
    highBill: bounded(raw.highBill, 0, 100_000),
    billMonths: billMonths.length ? billMonths : null,
    billAnnualKwh: bounded(raw.billAnnualKwh, 0, 1_000_000) ?? null,
  };
}

function validateLead(data: unknown): LeadPayload {
  const obj = data as Record<string, unknown>;
  if (!isLeadId(obj.id)) {
    throw new InvalidEnvelope('Invalid lead ID');
  }
  if (!obj.state || typeof obj.state !== 'string') {
    throw new InvalidEnvelope('Invalid state');
  }
  if (typeof obj.ts !== 'number') {
    throw new InvalidEnvelope('Invalid timestamp');
  }

  return {
    id: obj.id,
    resend: obj.resend === true,
    state: text(obj.state, 32),
    email: text(obj.email),
    phone: text(obj.phone, 32),
    address: text(obj.address),
    name: text(obj.name),
    source: slug(obj.source) ?? '',
    brand: typeof obj.brand === 'string' ? obj.brand : undefined,
    quote: validateContext(obj.quote),
    ts: obj.ts,
    honeypot: obj.honeypot as string,
    ttc_ms: obj.ttc_ms as number,
    mapScreenshot: obj.mapScreenshot as string | undefined,
  };
}

/**
 * Tell the owner a lead arrived.
 *
 * Returns whether it went. It used to be fire-and-forget inside a try/catch
 * that logged and moved on, so a Resend outage meant the record existed and
 * nobody knew about it.
 */
async function sendOwnerNotification(
  leadId: string,
  subject: string,
  html: string
): Promise<boolean> {
  try {
    const resend = getResendOrThrow();
    const { error } = await resend.emails.send(
      {
        from: 'Ground Mounts <leads@groundmounts.com>',
        to: NOTIFICATION_EMAIL,
        subject,
        html,
      },
      {
        // Same reasoning as the customer's copy: a retried submit must not put
        // a second "New Solar Lead" in the owner's inbox.
        idempotencyKey: ownerNotifyKey(leadId),
      }
    );

    if (error) {
      console.error('[LEAD_EMAIL_ERROR]', error);
      return false;
    }
    console.log('[LEAD_EMAIL_SENT]', NOTIFICATION_EMAIL);
    return true;
  } catch (error) {
    console.error('[LEAD_EMAIL_ERROR]', error instanceof Error ? error.message : error);
    return false;
  }
}

/** Stable per lead, so a repeat of the same send is recognised as one. */
function quoteEmailKey(leadId: string): string {
  return `gm:quote:${leadId}`;
}

function ownerNotifyKey(leadId: string): string {
  return `gm:owner-notify:${leadId}`;
}

/**
 * The customer's quote email.
 *
 * Rendered from the priced quote this route just computed, so the number in
 * the customer's inbox is the number in the owner's Airtable by construction
 * rather than by two routes agreeing.
 */
async function sendQuoteEmail(
  leadId: string,
  to: string,
  address: string,
  brandKey: string | undefined,
  inputs: { panelCount: number; trenchFeet: number },
  priced: {
    systemSizeKw: number;
    annualProductionKwh: number;
    quote: { lineItems: Array<{ key: string; label: string; detail?: string; amount: number }>; estimate: number; low: number; high: number };
  },
  mapScreenshotUrl?: string,
  results?: ResultsInput
): Promise<boolean> {
  try {
    const resend = getResendOrThrow();
    // The brand this funnel wears, which is a build setting or an explicit
    // ?brand=, never the attribution parameter: otherwise any URL could choose
    // what a customer's email claimed to be from.
    const brand = brandFor(brandKey);
    const template = EmailTemplate({
      client: to,
      address: address || 'Your Property',
      totalPanels: inputs.panelCount,
      systemSizeKw: priced.systemSizeKw,
      trenchingDistance: inputs.trenchFeet,
      annualProductionKwh: priced.annualProductionKwh,
      lineItems: priced.quote.lineItems,
      estimate: priced.quote.estimate,
      priceLow: priced.quote.low,
      priceHigh: priced.quote.high,
      date: new Date().toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      calendlyUrl: brand.calendlyUrl,
      brandName: brand.name,
      brandColor: brand.primaryColor,
      brandLogoUrl: brand.logoUrl,
      mapScreenshotUrl,
      results,
    }) as ReactElement;

    const { error } = await resend.emails.send(
      {
        from: brand.fromEmail,
        replyTo: brand.replyTo,
        to: [to],
        subject: `Your ${brand.name} estimate`,
        react: template,
      },
      {
        // Resend deduplicates on this for 24 hours.
        //
        // The window that matters is between the send returning and the
        // emailSent flag being written: a crash in there leaves a lead that
        // looks unsent, and the resend that follows would put a second copy of
        // the same quote in the customer's inbox. With the key, Resend
        // recognises the repeat and does not deliver it twice.
        idempotencyKey: quoteEmailKey(leadId),
      }
    );

    if (error) {
      console.error('[QUOTE_EMAIL_ERROR]', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[QUOTE_EMAIL_ERROR]', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Save a design from partway through the funnel.
 *
 * Deliberately narrow: a lead id, how far they got, the design, and where on
 * the earth it is. No name, no email, no phone, no address — those join at
 * step 6. An abandoned funnel should leave the owner an anonymous design to
 * look at, not a half-filled contact record they have to guess about.
 *
 * Upserted on Lead ID, so the four saves a session makes are one row that
 * fills in as the customer goes.
 */
async function savePartial(raw: Record<string, unknown>, ip: string): Promise<NextResponse> {
  if (!isLeadId(raw.id)) {
    return NextResponse.json({ ok: false, error: 'invalid_lead_id' }, { status: 400 });
  }
  const id = raw.id;

  const stepReached = Number(raw.stepReached);
  // Only the three steps worth recording. A caller naming step 7 is not a
  // funnel, and a caller naming step 0 would overwrite a real one with less.
  if (!PARTIAL_STEPS.includes(stepReached)) {
    return NextResponse.json({ ok: false, error: 'invalid_step' }, { status: 400 });
  }

  /**
   * The cheap checks first, because the expensive one is a network fan-out.
   *
   * A late partial for a funnel that has already been submitted, or the fourth
   * save in a minute from a stuck retry loop, should cost nothing at all — and
   * `partialFields` is five PVWatts calls, an SSURGO query and five Tilequery
   * samples on a cold cache. This read is advisory: it can be stale, which is
   * why the authoritative one still happens under the lease below. It is here
   * to avoid paying for work that is about to be thrown away.
   */
  try {
    const alreadyFiled = await storeGet<SubmitRecord>(SUBMIT_PREFIX + id);
    if (alreadyFiled?.leadFiled) {
      console.log('[LEAD_PARTIAL] ignored for a filed lead (early)', id, 'step', stepReached);
      return NextResponse.json({ ok: true, partial: true, skipped: 'already_filed' });
    }
  } catch {
    console.warn('[LEAD_PARTIAL] store unavailable, skipping', id);
    return NextResponse.json({ ok: true, partial: true, skipped: 'store_unavailable' });
  }

  if (!(await rateLimitOkAsync(`partial:${id}`, 'lead-partial-id'))) {
    console.log('[LEAD_PARTIAL] per-lead limit hit', id, 'from', ip);
    return NextResponse.json({ ok: true, partial: true, skipped: 'rate_limited' });
  }

  /**
   * The site lookup happens before the lease, not under it.
   *
   * Holding a lock across somebody else's network is how a background save
   * ends up blocking a customer's submit for seconds. The lease covers only
   * the two things that have to be atomic: the authoritative check that the
   * funnel has not finished, and the write.
   */
  const fields = await partialFields(raw, stepReached);

  const leaseKey = LEASE_PREFIX + id;
  let leaseToken: string | null;
  try {
    leaseToken = await acquireLease(leaseKey, LEASE_TTL_SECONDS);
  } catch {
    console.warn('[LEAD_PARTIAL] store unavailable at lease, skipping', id);
    return NextResponse.json({ ok: true, partial: true, skipped: 'store_unavailable' });
  }

  if (!leaseToken) {
    // A submit for this lead is mid-write. It is about to say everything this
    // save would have, and more.
    console.log('[LEAD_PARTIAL] lead is mid-write, skipping', id);
    return NextResponse.json({ ok: true, partial: true, skipped: 'in_progress' });
  }

  try {
    return await writePartial(id, stepReached, fields);
  } finally {
    // Held across the recheck and the write, and no longer.
    await releaseLease(leaseKey, leaseToken);
  }
}

/**
 * Everything a partial wants to say, worked out before any lock is taken.
 *
 * No PII: name, email, phone and address are never read here. The soil is the
 * server's finding or nothing, because a background save is written with
 * nobody reviewing it.
 */
async function partialFields(
  raw: Record<string, unknown>,
  stepReached: number
): Promise<LeadFields> {
  const fields: LeadFields = {
    'Step Reached': stepReached,
    Status: 'Partial',
    Source: slug(raw.source),
  };

  // The design, if there is one yet. Step 1 has coordinates and nothing else.
  try {
    const inputs = buildableInputs(parseQuoteInputs(raw.inputs));
    const facts = await siteFactsForArray(inputs.arrayCenter);
    const conditions = resolveSiteConditions({ ...inputs, soilClass: null }, facts);
    const priced = priceFromInputs({ ...inputs, ...conditions }, facts.curve);

    fields.Panels = inputs.panelCount;
    fields['Panel Tier'] = inputs.tier;
    fields['System Size kW'] = priced.systemSizeKw;
    fields['Trenching Distance ft'] = inputs.trenchFeet;
    fields['Battery Units'] = inputs.batteryUnits;
    fields['Site Prep'] = inputs.needsClearing;
    fields.Azimuth = inputs.azimuth;
    fields['Slope %'] = conditions.slopePercent ?? undefined;
    // The survey's classification, not the customer's answer: this column is
    // for the owner to see what the ground looked like from orbit.
    fields['Slope Tier'] = conditions.slopeTier ?? undefined;
    fields['Slope Answer'] = SLOPE_ANSWER_LABEL[inputs.slopeAnswer];
    fields['Rocky'] = inputs.rocky;
    fields['Battery Interest'] = inputs.batteryInterest;
    fields['Soil Class'] = conditions.soilClass ?? undefined;
    fields['Curve Source'] = facts.curveSource;
    fields['Est Annual Production kWh'] = priced.annualProductionKwh;
    // No prices on a partial: the customer has not been shown one yet, and a
    // figure in the record the owner might quote from should follow a submit.
  } catch {
    // No usable design yet. The row is still worth writing: it says somebody
    // got this far and where they were looking.
  }

  const coordinates = raw.coordinates as { latitude?: number; longitude?: number } | undefined;
  const lat = Number(coordinates?.latitude);
  const lng = Number(coordinates?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    fields.Latitude = lat;
    fields.Longitude = lng;
  }

  return fields;
}

/**
 * A partial save, with the lease already held.
 *
 * Split out so the lease cannot be forgotten on an early return: every path
 * below returns, and the caller's `finally` gives it back.
 */
async function writePartial(
  id: string,
  stepReached: number,
  fields: LeadFields
): Promise<NextResponse> {
  /**
   * A finished funnel does not go backwards.
   *
   * Partial saves are fire-and-forget from a page that may still be open in a
   * tab, so one can land after the submit it precedes. Read under the lease,
   * so a submit cannot slip between this and the write below.
   */
  let completed: SubmitRecord | null = null;
  try {
    completed = await storeGet<SubmitRecord>(SUBMIT_PREFIX + id);
  } catch {
    // The store is unreachable. A partial is not worth a 503 to the customer,
    // but it is worth not writing blindly, so this one is dropped.
    console.warn('[LEAD_PARTIAL] store unavailable, skipping', id);
    return NextResponse.json({ ok: true, partial: true, skipped: 'store_unavailable' });
  }

  if (completed?.leadFiled) {
    console.log('[LEAD_PARTIAL] ignored for a filed lead', id, 'step', stepReached);
    return NextResponse.json({ ok: true, partial: true, skipped: 'already_filed' });
  }

  const clean = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined && v !== '')
  ) as LeadFields;

  try {
    const { created } = await upsertLeadByLeadId(clean, id);
    console.log('[LEAD_PARTIAL]', id, 'step:', stepReached, created ? 'created' : 'updated');
    return NextResponse.json({ ok: true, partial: true, stepReached });
  } catch (error) {
    // A partial save must never be visible to the customer. Log and move on.
    console.error('[LEAD_PARTIAL_ERROR]', id, error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, partial: true, error: 'not_saved' }, { status: 502 });
  }
}

/**
 * Put the map screenshot in Blob storage.
 *
 * Called only once Airtable has accepted the record. Uploading first meant a
 * lead rejected for any reason — a schema mismatch, a bad field — still left a
 * public image in the owner's Blob store with nothing pointing at it and
 * nothing to clean it up.
 */
async function uploadScreenshot(leadId: string, dataUrl: string): Promise<string | undefined> {
  if (!/^data:image\/(png|jpeg);base64,/.test(dataUrl)) return undefined;

  try {
    const base64Data = dataUrl.replace(/^data:image\/(png|jpeg);base64,/, '');

    // Reject on the encoded length first, before allocating the buffer.
    if (base64Data.length > MAX_SCREENSHOT_B64_CHARS) {
      throw new Error(`screenshot too large (encoded): ${Math.round(base64Data.length / 1024)}KB`);
    }

    const buffer = Buffer.from(base64Data, 'base64');

    // Cap the size and confirm the bytes really are an image before anything
    // reaches Blob storage, so this endpoint cannot host arbitrary files.
    const kind = sniffImage(buffer);
    if (!kind) throw new Error('screenshot is neither PNG nor JPEG');
    if (buffer.length > MAX_SCREENSHOT_BYTES) {
      throw new Error(
        `screenshot too large: ${Math.round(buffer.length / 1024)}KB > ${MAX_SCREENSHOT_BYTES / 1024}KB`
      );
    }

    const blob = await put(`map-screenshots/${leadId}.${kind.ext}`, buffer, {
      access: 'public',
      contentType: kind.contentType,
    });
    console.log('[MAP_SCREENSHOT_UPLOADED]', leadId, 'size:', Math.round(buffer.length / 1024), 'KB');
    return blob.url;
  } catch (error) {
    console.error(
      '[MAP_SCREENSHOT_UPLOAD_ERROR]',
      error instanceof Error ? error.message : error
    );
    // The lead matters more than the picture.
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  // Hoisted so an unexpected throw anywhere below still gives the lease back —
  // and only ours, never a newer holder's.
  let heldLease: { key: string; token: string } | null = null;

  try {
    /**
     * The cheap checks come before the body is parsed.
     *
     * Rate limiting and the honeypot used to sit behind `await req.json()`,
     * which meant a flood of 5 MB payloads was parsed in full before anything
     * decided whether to serve it. The kind of request they exist to shed is
     * exactly the kind that costs most to read.
     */
    const ip = getClientIp(req);
    const isPartial = req.headers.get('x-gm-partial') === '1' || req.nextUrl.searchParams.get('partial') === '1';
    const declaredHoneypot = req.headers.get('x-gm-hp');

    if (!(await rateLimitOkAsync(ip, isPartial ? "lead-partial" : "leads"))) {
      console.log("[LEADS_BLOCKED] Rate limited", isPartial ? "(partial)" : "");
      return NextResponse.json(
        { ok: false, leadFiled: false, emailSent: false, error: "rate_limited" },
        { status: 429 }
      );
    }

    // The header first, because it is free. The body's copy is checked below
    // once it has been parsed: a client that sends only the field is still
    // caught, and one that sends only the header is caught here.
    if (isBotHoneypot(declaredHoneypot ?? undefined)) {
      console.log("[LEADS_BLOCKED] Bot honeypot triggered (header)");
      return NextResponse.json({ ok: true, ignored: true, leadFiled: true, emailSent: true });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      // Nothing about the parse error is worth logging: it is attacker text,
      // and a stack trace here says more about us than about them.
      console.log('[LEADS_BLOCKED] Malformed JSON from', ip);
      return NextResponse.json(
        { ok: false, leadFiled: false, emailSent: false, error: 'bad_request' },
        { status: 400 }
      );
    }

    const raw = (body ?? {}) as Record<string, unknown>;

    // The body's own honeypot still counts: the header is an addition, not a
    // replacement, and the existing client sends the field.
    if (isBotHoneypot(raw.honeypot as string)) {
      console.log("[LEADS_BLOCKED] Bot honeypot triggered");
      return NextResponse.json({ ok: true, ignored: true, leadFiled: true, emailSent: true });
    }

    const partial = isPartial || raw.partial === true;

    /**
     * A resend needs an id and nothing else.
     *
     * It reads a stored record and sends the email that record describes, so
     * demanding a state, a timestamp and a time-to-complete was asking the
     * client to reconstruct a submit it is not making.
     */
    const wantsResend = raw.resend === true;

    // A missing ttc_ms is rejected the same as a too-fast one — but only on a
    // real submit. A partial save at step 1 legitimately happens within
    // seconds of arriving, and a resend is finishing work already done.
    if (!partial && !wantsResend && !minTimeOk(raw.ttc_ms)) {
      console.log("[LEADS_BLOCKED] Too fast or missing ttc_ms");
      return NextResponse.json(
        { ok: false, leadFiled: false, emailSent: false, error: "too_fast" },
        { status: 400 }
      );
    }

    if (partial) return await savePartial(raw, ip);

    const lead = wantsResend ? validateResend(raw) : validateLead(raw);
    console.log("[LEADS_VALIDATED]", lead.id);

    const submitKey = SUBMIT_PREFIX + lead.id;
    const leaseKey = LEASE_PREFIX + lead.id;

    // The stored record is read before anything is parsed, priced or looked
    // up, because a resend must not touch the request body at all — and an
    // unknown lead id must cost nothing. Pricing a resend would mean an
    // unauthenticated caller could spend a PVWatts and an SSURGO call per
    // request just by inventing ids.

    /**
     * What the server already knows about this submit.
     *
     * A configured store that cannot be read is not the same as no record: the
     * first answers "this may or may not have happened", and guessing wrong
     * means either a duplicate record or a lost lead. So it is a 503 and the
     * client keeps the payload.
     */
    let stored: SubmitRecord | null;
    try {
      stored = await storeGet<SubmitRecord>(submitKey);
    } catch (error) {
      console.error('[LEADS_STORE_DOWN]', lead.id, error);
      return NextResponse.json(
        { ok: false, leadFiled: false, emailSent: false, error: 'store_unavailable' },
        { status: 503 }
      );
    }

    // A resend is not a way to send mail. It is a way to finish one specific
    // submit that this server remembers failing halfway.
    //
    // Everything except the lead id is ignored: the recipient and the figures
    // come from what was stored when the record was written. Without that, the
    // route would forward any address in any request body to Resend under our
    // own verified domain, which is an open relay with a solar quote attached.
    if (lead.resend) {
      if (!stored || !stored.leadFiled) {
        console.log('[LEAD_RESEND_UNKNOWN]', lead.id);
        return NextResponse.json(
          { ok: false, leadFiled: false, emailSent: false, error: 'no_such_lead' },
          { status: 404 }
        );
      }

      if (stored.emailSent) {
        // The customer has their quote. The owner may still not have theirs.
        if (!stored.ownerNotified && stored.notifySubject && stored.notifyHtml) {
          const ownerNotified = await sendOwnerNotification(
            lead.id,
            stored.notifySubject,
            stored.notifyHtml
          );
          if (ownerNotified) {
            const updated = { ...stored, ownerNotified };
            try {
              await storeSet(submitKey, updated, SUBMIT_TTL_SECONDS);
            } catch (error) {
              console.warn('[LEAD_RESEND_FLAG]', lead.id, error);
            }
            return NextResponse.json(replyFrom(updated, { duplicate: true }));
          }
        }
        return NextResponse.json(replyFrom(stored, { duplicate: true }));
      }

      const emailSent = await sendQuoteEmail(
        lead.id,
        stored.email,
        stored.address,
        stored.brand,
        { panelCount: stored.totalPanels, trenchFeet: stored.trenchFeet },
        {
          systemSizeKw: stored.systemSizeKw,
          annualProductionKwh: stored.annualProductionKwh,
          quote: {
            lineItems: stored.lineItems,
            estimate: stored.estimate,
            low: stored.priceLow,
            high: stored.priceHigh,
          },
        },
        stored.mapScreenshotUrl,
        stored.results
      );
      console.log('[LEAD_EMAIL_RESEND]', lead.id, emailSent ? 'sent' : 'failed');

      if (emailSent) {
        const updated: SubmitRecord = { ...stored, emailSent: true, ok: true };

        // The owner's copy can be the half that failed, and a lead nobody was
        // told about is a lead nobody calls. Retried from the stored message,
        // and deduplicated by the same key as the original attempt.
        if (!stored.ownerNotified && stored.notifySubject && stored.notifyHtml) {
          updated.ownerNotified = await sendOwnerNotification(
            lead.id,
            stored.notifySubject,
            stored.notifyHtml
          );
        }

        try {
          await storeSet(submitKey, updated, SUBMIT_TTL_SECONDS);
        } catch (error) {
          // The mail went. Losing the flag means one extra resend at worst.
          console.warn('[LEAD_RESEND_FLAG]', lead.id, error);
        }
        return NextResponse.json(replyFrom(updated));
      }

      return NextResponse.json(replyFrom({ ...stored, ok: false }), { status: 502 });
    }

    // Price the design here, not on the customer's phone.
    //
    // The record the owner quotes from must be one this server computed. A
    // browser can describe its design; it cannot name its own price, and a
    // payload that tries is priced from its inputs like any other.
    let priced;
    let inputs;
    let facts;
    let conditions;
    try {
      // Disabled options are dropped before anything is priced or recorded, so
      // a payload asking for a battery we do not sell does not put one in the
      // owner's Airtable.
      inputs = buildableInputs(parseQuoteInputs(lead.quote?.inputs));
      // One lookup for this array: curve, soil and slope, all for the same
      // coordinates out of the same cache entry. Everything the ground
      // contributes to the price is decided here, not in the payload.
      facts = await siteFactsForArray(inputs.arrayCenter);
      conditions = resolveSiteConditions(inputs, facts);
      priced = priceFromInputs({ ...inputs, ...conditions }, facts.curve);
    } catch (error) {
      if (error instanceof InvalidQuoteInputs) {
        console.log('[LEADS_BLOCKED] Invalid quote inputs:', error.message);
        return NextResponse.json(
          { ok: false, leadFiled: false, emailSent: false, error: 'invalid_inputs' },
          { status: 400 }
        );
      }
      throw error;
    }

    // A repeat of a completed submit replays it and writes nothing.
    if (stored) {
      console.log('[LEADS_DUPLICATE] replaying stored result for', lead.id);

      // With one exception: if the owner was never told about this lead, a
      // repeat is the only thing that will come along to finish the job. The
      // idempotency key stops it arriving twice.
      if (!stored.ownerNotified && stored.notifySubject && stored.notifyHtml) {
        const ownerNotified = await sendOwnerNotification(
          lead.id,
          stored.notifySubject,
          stored.notifyHtml
        );
        if (ownerNotified) {
          const updated = { ...stored, ownerNotified };
          try {
            await storeSet(submitKey, updated, SUBMIT_TTL_SECONDS);
          } catch (error) {
            console.warn('[LEAD_NOTIFY_FLAG]', lead.id, error);
          }
          return NextResponse.json(replyFrom(updated, { duplicate: true }));
        }
      }

      return NextResponse.json(replyFrom(stored, { duplicate: true }));
    }

    /**
     * Lease, then commit.
     *
     * The lease is held only for as long as the work takes and is released the
     * moment anything fails, so a customer whose submit hit a broken Airtable
     * can press the button again immediately. The durable record is written
     * after the write succeeds — it is a record of what happened, not a claim
     * that it is about to.
     */
    /**
     * Wait briefly rather than refusing.
     *
     * Partials hold this lease too, and one takes a few hundred milliseconds.
     * A submit that gave up immediately would 409, the queue would drop it as
     * a 4xx, and a customer would lose their lead to a background save that
     * was about to finish. Two concurrent *submits* still resolve the same
     * way, because the one that wins files the lead.
     */
    let leaseToken: string | null = null;
    try {
      for (let attempt = 0; attempt < 6 && !leaseToken; attempt++) {
        leaseToken = await acquireLease(leaseKey, LEASE_TTL_SECONDS);
        if (!leaseToken) await new Promise((resolve) => setTimeout(resolve, 250));
      }
    } catch (error) {
      console.error('[LEADS_STORE_DOWN]', lead.id, error);
      return NextResponse.json(
        { ok: false, leadFiled: false, emailSent: false, error: 'store_unavailable' },
        { status: 503 }
      );
    }

    if (!leaseToken) {
      /**
       * Retryable, not droppable.
       *
       * This used to be a 409, and the queue drops 4xx. But the thing holding
       * the lease is usually a partial save that is about to finish, and a
       * concurrent submit that is genuinely a duplicate will find the stored
       * record and replay it. Neither case is "this request can never work",
       * which is the only thing a 4xx should mean.
       */
      console.log('[LEADS_BUSY]', lead.id);
      return NextResponse.json(
        { ok: false, leadFiled: false, emailSent: false, error: 'busy' },
        { status: 503 }
      );
    }

    heldLease = { key: leaseKey, token: leaseToken };

    /**
     * Read again, now that nobody else can be writing.
     *
     * The first read happened before the lease. Two submits landing together
     * both saw "not filed", and the one that waited for the lease then wrote a
     * second record — the exact thing the lease exists to prevent, moved one
     * step along rather than removed. This is the check that counts.
     */
    try {
      const settled = await storeGet<SubmitRecord>(submitKey);
      if (settled) {
        await releaseLease(leaseKey, leaseToken);
        heldLease = null;
        console.log('[LEADS_DUPLICATE] replaying result written while we waited', lead.id);
        return NextResponse.json(replyFrom(settled, { duplicate: true }));
      }
    } catch (error) {
      await releaseLease(leaseKey, leaseToken);
      heldLease = null;
      console.error('[LEADS_STORE_DOWN]', lead.id, error);
      return NextResponse.json(
        { ok: false, leadFiled: false, emailSent: false, error: 'store_unavailable' },
        { status: 503 }
      );
    }

    // Parse address components
    const addressParts = lead.address ? parseAddress(lead.address) : {};

    /*
      The twenty-five year comparison, from the price the server computed.

      Built here rather than taken from the payload so the record and the
      email cannot claim a payback for a number nobody was quoted. The
      inflation figure is the customer's, bounded to the slider's range.
    */
    const inflationPct = lead.quote?.utilityInflationPct ?? RESULTS.utilityInflationPct;
    const results = resultsFor(lead, priced.quote.estimate, inflationPct);
    const breakEvenYear = results ? projectResults(results).breakEvenYear ?? undefined : undefined;

    // Build Airtable fields
    // Source options in Airtable: groundmounts.com, texasgroundmountsolar.com, backyardsolartexas.com, groundmountsolar.guide
    // Status options in Airtable: New, Contacted, Qualified, etc.
    const fields: LeadFields = {
      Name: lead.name || undefined,
      Email: lead.email || undefined,
      Phone: lead.phone || undefined,
      Address: lead.address || undefined,
      City: addressParts.city,
      State: addressParts.state || lead.state,
      Zip: addressParts.zip,
      Panels: inputs.panelCount,
      'System Size kW': priced.systemSizeKw,
      'Monthly Bill Avg': lead.quote?.avgBill,
      'Monthly Bill High': lead.quote?.highBill,
      'Offset Percentage': lead.quote?.percentage,
      // Recorded so the owner can see what the sizing was based on, and only
      // the usage figures the customer confirmed — never the document.
      'Bill Upload': Array.isArray(lead.quote?.billMonths) && lead.quote.billMonths.length > 0,
      'Monthly kWh JSON': Array.isArray(lead.quote?.billMonths) && lead.quote.billMonths.length
        ? JSON.stringify(lead.quote.billMonths)
        : undefined,
      'Trenching Distance ft': inputs.trenchFeet,
      // Legacy columns, kept for the owner's existing views. Midpoints of the
      // same priced figures rather than a second calculation.
      'Trenching Cost': midpoint(priced.trench.low, priced.trench.high),
      'Equipment Cost': midpoint(priced.equipment.low, priced.equipment.high),
      'Total Investment': midpoint(priced.quote.low, priced.quote.high),
      'Price Low': priced.quote.low,
      'Price High': priced.quote.high,
      'Equipment Cost Low': priced.equipment.low,
      'Equipment Cost High': priced.equipment.high,
      'Trenching Cost Low': priced.trench.low,
      'Trenching Cost High': priced.trench.high,
      'Line Items JSON': JSON.stringify(priced.quote.lineItems),
      'Panel Tier': inputs.tier,
      'Battery Units': inputs.batteryUnits,
      'Site Prep': inputs.needsClearing,
      'Slope %': conditions.slopePercent ?? undefined,
      'Slope Tier': conditions.slopeTier ?? undefined,
      'Slope Answer': SLOPE_ANSWER_LABEL[inputs.slopeAnswer],
      Rocky: inputs.rocky,
      'Battery Interest': inputs.batteryInterest,
      // What the customer was shown after the reveal, so a call can start from
      // the same arithmetic they were looking at.
      'Utility Inflation Pct': inflationPct,
      'Break Even Year': breakEvenYear,
      'Soil Class': conditions.soilClass ?? undefined,
      'Est Annual Production kWh': priced.annualProductionKwh,
      // Whether that production figure came from the site's own PVWatts curve
      // or the Texas reference, so a quote can be read in context later.
      'Curve Source': facts.curveSource,
      Azimuth: inputs.azimuth,
      Source: lead.source || undefined,
      // The funnel is finished, so the row stops being a partial.
      Status: 'New',
      'Step Reached': 6,

    };

    // Remove undefined fields
    const cleanFields = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined && v !== '')
    ) as LeadFields;

    // Upserted, not created: the partial saves from steps 1, 3 and 4 have been
    // writing to this row all along, and the owner should have one record per
    // customer rather than four.
    //
    // Nothing is remembered as done until this returns. If Airtable is down,
    // the lease goes back immediately and the customer can press the button
    // again rather than being told their submit is already in progress.
    let result: { id?: string };
    try {
      result = await upsertLeadByLeadId(cleanFields, lead.id);
    } catch (error) {
      await releaseLease(leaseKey, leaseToken);
      heldLease = null;
      console.error('[LEAD_WRITE_FAILED]', lead.id, error instanceof Error ? error.message : error);
      return NextResponse.json(
        { ok: false, leadFiled: false, emailSent: false, error: 'lead_not_saved' },
        { status: 502 }
      );
    }

    console.log("[LEAD_CAPTURED]", lead.id, "airtable_id:", result.id);

    // Now that the record exists, and only now, the screenshot is worth
    // storing. The row is then patched with the attachment; a failure here
    // costs the picture, never the lead.
    let mapScreenshotUrl: string | undefined;
    if (lead.mapScreenshot) {
      mapScreenshotUrl = await uploadScreenshot(lead.id, lead.mapScreenshot);
      if (mapScreenshotUrl) {
        try {
          await upsertLeadByLeadId({ 'Map Screenshot': [{ url: mapScreenshotUrl }] }, lead.id);
        } catch (error) {
          console.error(
            '[MAP_SCREENSHOT_ATTACH_ERROR]',
            lead.id,
            error instanceof Error ? error.message : error
          );
          // Nothing points at it now, and nothing ever will. A public image of
          // somebody's property left in storage with no record referencing it
          // is worse than no screenshot.
          try {
            await del(mapScreenshotUrl);
            console.log('[MAP_SCREENSHOT_ORPHAN_DELETED]', lead.id);
          } catch (cleanupError) {
            console.error(
              '[MAP_SCREENSHOT_ORPHAN_KEPT]',
              lead.id,
              cleanupError instanceof Error ? cleanupError.message : cleanupError
            );
          }
          mapScreenshotUrl = undefined;
        }
      }
    }

    /**
     * The record exists, so this submit has happened. Commit that fact before
     * anything else can fail.
     *
     * Written with emailSent false and updated after the send: a crash between
     * the two leaves a lead that is filed and unsent, which is exactly the
     * state `resend` exists to finish.
     */
    const record: SubmitRecord = {
      ok: true,
      leadFiled: true,
      emailSent: false,
      ownerNotified: false,
      // The screen reveals these, not its own arithmetic. The customer must be
      // shown the number that was filed and emailed, even if this page has
      // somehow computed a different one.
      priceLow: priced.quote.low,
      priceHigh: priced.quote.high,
      lineItems: priced.quote.lineItems,
      airtableId: result.id,
      email: lead.email ?? '',
      address: lead.address ?? '',
      brand: lead.brand,
      totalPanels: inputs.panelCount,
      trenchFeet: inputs.trenchFeet,
      systemSizeKw: priced.systemSizeKw,
      annualProductionKwh: priced.annualProductionKwh,
      estimate: priced.quote.estimate,
    };

    try {
      await storeSet(SUBMIT_PREFIX + lead.id, record, SUBMIT_TTL_SECONDS);
    } catch (error) {
      // The lead is filed. Without the record a repeat would file it again, so
      // hold the lease to its full minute rather than releasing it, and tell
      // the client to retry: the store may be back by then.
      console.error('[LEAD_RECORD_FAILED]', lead.id, error);
      return NextResponse.json(
        { ok: false, leadFiled: true, emailSent: false, error: 'store_unavailable' },
        { status: 503 }
      );
    }

    // The customer's quote email. The lead is already safe at this point, so a
    // failure here is reported in the response rather than failing the request:
    // the client retries the email alone, through `resend`.
    const emailSent = lead.email
      ? await sendQuoteEmail(
          lead.id,
          lead.email,
          lead.address ?? '',
          lead.brand,
          inputs,
          priced,
          mapScreenshotUrl,
          results
        )
      : false;

    record.emailSent = emailSent;
    record.results = results;
    // Kept on the record so a resend reproduces the same email, picture and all.
    record.mapScreenshotUrl = mapScreenshotUrl;

    // The owner's notification. Built here and stored with the record, so a
    // retry sends the same message rather than rebuilding it from state that
    // may have moved on.
    const airtableUrl = AIRTABLE_TABLE_ID
        ? `https://airtable.com/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${result.id}`
        : `https://airtable.com/${AIRTABLE_BASE_ID}`;
    const cityDisplay = addressParts.city || 'Unknown City';
    const stateDisplay = addressParts.state || lead.state || 'TX';

      // Everything below is attacker-controlled; escape before it enters HTML.
    const kw = priced.systemSizeKw;
    const panels = inputs.panelCount;
    const avgBill = lead.quote?.avgBill;
    const trenchFt = inputs.trenchFeet;
    const equipment = midpoint(priced.equipment.low, priced.equipment.high);
    const trenchCost = midpoint(priced.trench.low, priced.trench.high);
    const total = midpoint(priced.quote.low, priced.quote.high);

    const notifySubject = headerSafe(
            `New Solar Lead: ${headerSafe(lead.name, 'Unknown')} - ${headerSafe(cityDisplay)}, ${headerSafe(stateDisplay)}`
          );
    const notifyHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #16a34a; margin-bottom: 24px;">New Lead Received</h2>

              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666; width: 140px;">Name</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; font-weight: 600;">${escapeOr(lead.name, 'Not provided')}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666;">Email</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;"><a href="mailto:${escapeHtml(lead.email)}" style="color: #2563eb;">${escapeOr(lead.email, 'Not provided')}</a></td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666;">Phone</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;"><a href="tel:${escapeHtml(lead.phone)}" style="color: #2563eb;">${escapeOr(lead.phone, 'Not provided')}</a></td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666;">Address</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${escapeOr(lead.address, 'Not provided')}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666;">System Size</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${kw ? `${escapeHtml(kw)} kW` : 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666;">Panels</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${panels ? escapeHtml(panels) : 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666;">Monthly Bill (Avg)</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${avgBill ? `$${escapeHtml(avgBill)}` : 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666;">Trenching Distance</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${trenchFt ? `${escapeHtml(trenchFt)} ft` : 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666;">Equipment Cost</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${typeof equipment === 'number' ? `$${escapeHtml(equipment.toLocaleString())}` : 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666;">Trenching Cost</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${typeof trenchCost === 'number' ? `$${escapeHtml(trenchCost.toLocaleString())}` : 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666; font-weight: 600;">Total Investment</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #16a34a;">${typeof total === 'number' ? `$${escapeHtml(total.toLocaleString())}` : 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5; color: #666;">Source</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">${escapeOr(lead.source, 'Direct')}</td>
                </tr>
              </table>

              ${mapScreenshotUrl ? `
              <div style="margin-top: 24px;">
                <h3 style="color: #374151; margin-bottom: 12px; font-size: 14px;">Panel Placement Map</h3>
                <img src="${escapeHtml(mapScreenshotUrl)}" alt="Panel placement map" style="max-width: 100%; border-radius: 8px; border: 1px solid #e5e5e5;" />
              </div>
              ` : ''}

              <div style="margin-top: 24px;">
                <a href="${escapeHtml(airtableUrl)}" style="display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">View in Airtable</a>
              </div>

              <p style="margin-top: 24px; color: #999; font-size: 12px;">
                Lead ID: ${escapeHtml(lead.id)}<br>
                Received: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT
              </p>
            </div>
          `;

    // Stored with the record so a retry sends the same message rather than
    // rebuilding it from state that may have moved on.
    record.notifySubject = notifySubject;
    record.notifyHtml = notifyHtml;
    record.ownerNotified = await sendOwnerNotification(lead.id, notifySubject, notifyHtml);

    try {
      await storeSet(SUBMIT_PREFIX + lead.id, record, SUBMIT_TTL_SECONDS);
    } catch (error) {
      // Both sends are done; losing the flags costs at most one duplicate that
      // Resend's idempotency key will swallow anyway.
      console.warn('[LEAD_RECORD_FLAGS]', lead.id, error);
    }

    // The work is committed and the record is written; the lease has done its
    // job and the next request should be answered from the record.
    await releaseLease(leaseKey, leaseToken);
    heldLease = null;

    return NextResponse.json(replyFrom(record));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[LEADS_ROUTE_ERROR]", msg);
    if (stack) console.error("[LEADS_ROUTE_STACK]", stack);

    // Whose fault is this?
    //
    // An unreadable envelope is the caller's, and a 4xx tells the queue to
    // drop it — retrying a malformed payload forever helps nobody. Anything
    // else reaching here is ours, so it is a 5xx and the lead is kept.
    if (e instanceof InvalidEnvelope) {
      console.log('[LEADS_BLOCKED] Invalid envelope:', msg);
      return NextResponse.json(
        { ok: false, leadFiled: false, emailSent: false, error: 'bad_request' },
        { status: 400 }
      );
    }

    // Give the lease back so the retry is not told it is already in progress.
    if (heldLease) await releaseLease(heldLease.key, heldLease.token);

    const status = e instanceof StoreUnavailable ? 503 : 502;
    return NextResponse.json(
      { ok: false, leadFiled: false, emailSent: false, error: msg || "server_error" },
      { status }
    );
  }
}
