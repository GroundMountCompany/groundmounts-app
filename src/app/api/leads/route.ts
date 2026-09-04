import { NextRequest, NextResponse } from "next/server";
import { upsertLeadByLeadId, parseAddress, LeadFields } from "@/lib/airtable";
import { getClientIp, rateLimitOkAsync, isBotHoneypot, minTimeOk } from "@/lib/guard";
import { getResendOrThrow } from "@/lib/resendSafe";
import { put } from "@vercel/blob";
import { escapeHtml, escapeOr, headerSafe } from "@/lib/escape";
import { sniffImage } from "@/lib/imageSniff";
import { parseQuoteInputs, priceFromInputs, InvalidQuoteInputs } from "@/lib/quoteInputs";
import { siteFactsForArray, resolveSiteConditions } from "@/lib/server/siteLookup";
import EmailTemplate from "@/components/common/EmailTemplate";
import type { ReactElement } from "react";
import { brandFor } from "@/config/brands";
import {
  storeGet,
  storeSet,
  acquireLease,
  releaseLease,
  StoreUnavailable,
} from "@/lib/server/redis";

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
    highBill?: number;
    billMonths?: Array<{ month: string; kwh: number; cost: number | null }> | null;
    billAnnualKwh?: number | null;
  };
  ts: number;
  honeypot?: string;
  ttc_ms?: number;
  mapScreenshot?: string;
}

function validateLead(data: unknown): LeadPayload {
  const obj = data as Record<string, unknown>;
  if (!obj.id || typeof obj.id !== 'string' || obj.id.length < 8) {
    throw new Error('Invalid lead ID');
  }
  if (!obj.state || typeof obj.state !== 'string') {
    throw new Error('Invalid state');
  }
  if (typeof obj.ts !== 'number') {
    throw new Error('Invalid timestamp');
  }

  return {
    id: obj.id,
    resend: obj.resend === true,
    state: obj.state,
    email: (obj.email as string) || "",
    phone: (obj.phone as string) || "",
    address: (obj.address as string) || "",
    name: (obj.name as string) || "",
    source: (obj.source as string) || "",
    brand: typeof obj.brand === 'string' ? obj.brand : undefined,
    quote: obj.quote as LeadPayload['quote'],
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
  }
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
      brandLogoUrl: brand.logo.startsWith('http')
        ? brand.logo
        : `https://${brand.domain}${brand.logo}`,
      brandColor: brand.primaryColor,
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
async function savePartial(raw: Record<string, unknown>): Promise<NextResponse> {
  const id = typeof raw.id === 'string' ? raw.id : '';
  if (id.length < 8) {
    return NextResponse.json({ ok: false, error: 'invalid_lead_id' }, { status: 400 });
  }

  const stepReached = Number(raw.stepReached);
  if (!Number.isFinite(stepReached) || stepReached < 0 || stepReached > 10) {
    return NextResponse.json({ ok: false, error: 'invalid_step' }, { status: 400 });
  }

  const fields: LeadFields = {
    'Step Reached': Math.round(stepReached),
    Status: 'Partial',
    Source: typeof raw.source === 'string' ? raw.source : undefined,
  };

  // The design, if there is one yet. Step 1 has coordinates and nothing else.
  try {
    const inputs = parseQuoteInputs(raw.inputs);
    const facts = await siteFactsForArray(inputs.arrayCenter);
    const conditions = resolveSiteConditions(inputs, facts);
    const priced = priceFromInputs({ ...inputs, ...conditions }, facts.curve);

    fields.Panels = inputs.panelCount;
    fields['Panel Tier'] = inputs.tier;
    fields['System Size kW'] = priced.systemSizeKw;
    fields['Trenching Distance ft'] = inputs.trenchFeet;
    fields['Battery Units'] = inputs.batteryUnits;
    fields['Site Prep'] = inputs.needsClearing;
    fields.Azimuth = inputs.azimuth;
    fields['Slope %'] = conditions.slopePercent ?? undefined;
    fields['Slope Tier'] = priced.quote.slopeTier;
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
  if (typeof coordinates?.latitude === 'number' && typeof coordinates?.longitude === 'number') {
    fields.Latitude = coordinates.latitude;
    fields.Longitude = coordinates.longitude;
  }

  const clean = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined && v !== '')
  ) as LeadFields;

  try {
    const { created } = await upsertLeadByLeadId(clean, id);
    console.log('[LEAD_PARTIAL]', id, 'step:', fields['Step Reached'], created ? 'created' : 'updated');
    return NextResponse.json({ ok: true, partial: true, stepReached: fields['Step Reached'] });
  } catch (error) {
    // A partial save must never be visible to the customer. Log and move on.
    console.error('[LEAD_PARTIAL_ERROR]', id, error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, partial: true, error: 'not_saved' }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  // Hoisted so an unexpected throw anywhere below still gives the lease back —
  // and only ours, never a newer holder's.
  let heldLease: { key: string; token: string } | null = null;

  try {
    const body = await req.json();
    const raw = body as Record<string, unknown>;

    /**
     * A save from partway through the funnel: a design nobody has put their
     * name to yet. It carries coordinates and geometry and no PII at all, so
     * an abandoned funnel leaves an anonymous row rather than a half-filled
     * contact record.
     */
    const isPartial = raw.partial === true;

    // Apply guards before processing.
    const ip = getClientIp(req);
    if (!(await rateLimitOkAsync(ip, isPartial ? "lead-partial" : "leads"))) {
      console.log("[LEADS_BLOCKED] Rate limited", isPartial ? "(partial)" : "");
      return NextResponse.json(
        { ok: false, leadFiled: false, emailSent: false, error: "rate_limited" },
        { status: 429 }
      );
    }

    if (isBotHoneypot(raw.honeypot as string)) {
      console.log("[LEADS_BLOCKED] Bot honeypot triggered");
      // Pretend success so the bot learns nothing.
      return NextResponse.json({ ok: true, ignored: true, leadFiled: true, emailSent: true });
    }

    // A missing ttc_ms is rejected the same as a too-fast one — but only on a
    // real submit. A partial save at step 1 legitimately happens within
    // seconds of arriving, and holding it to the same bar would throw away
    // every design from a customer who moves quickly.
    if (!isPartial && !minTimeOk(raw.ttc_ms)) {
      console.log("[LEADS_BLOCKED] Too fast or missing ttc_ms");
      return NextResponse.json(
        { ok: false, leadFiled: false, emailSent: false, error: "too_fast" },
        { status: 400 }
      );
    }

    if (isPartial) return await savePartial(raw);

    const lead = validateLead(body);
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
        }
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
      inputs = parseQuoteInputs(lead.quote?.inputs);
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
    let leaseToken: string | null;
    try {
      leaseToken = await acquireLease(leaseKey, LEASE_TTL_SECONDS);
    } catch (error) {
      console.error('[LEADS_STORE_DOWN]', lead.id, error);
      return NextResponse.json(
        { ok: false, leadFiled: false, emailSent: false, error: 'store_unavailable' },
        { status: 503 }
      );
    }

    if (!leaseToken) {
      // Another request for this same lead is mid-write. Dropping is right:
      // that one is going to finish the job.
      console.log('[LEADS_IN_PROGRESS]', lead.id);
      return NextResponse.json(
        { ok: false, leadFiled: false, emailSent: false, error: 'in_progress' },
        { status: 409 }
      );
    }

    heldLease = { key: leaseKey, token: leaseToken };

    // Upload map screenshot to Vercel Blob if provided
    let mapScreenshotUrl: string | undefined;
    if (lead.mapScreenshot && /^data:image\/(png|jpeg);base64,/.test(lead.mapScreenshot)) {
      try {
        const base64Data = lead.mapScreenshot.replace(/^data:image\/(png|jpeg);base64,/, '');

        // Reject on the encoded length first, before allocating the buffer.
        if (base64Data.length > MAX_SCREENSHOT_B64_CHARS) {
          throw new Error(
            `screenshot too large (encoded): ${Math.round(base64Data.length / 1024)}KB`
          );
        }

        const buffer = Buffer.from(base64Data, 'base64');

        // Cap the size and confirm the bytes really are an image before anything
        // reaches Blob storage, so this endpoint cannot host arbitrary files.
        const kind = sniffImage(buffer);
        if (!kind) {
          throw new Error('screenshot is neither PNG nor JPEG');
        }
        if (buffer.length > MAX_SCREENSHOT_BYTES) {
          throw new Error(
            `screenshot too large: ${Math.round(buffer.length / 1024)}KB > ${MAX_SCREENSHOT_BYTES / 1024}KB`
          );
        }

        // Upload to Vercel Blob
        const blob = await put(`map-screenshots/${lead.id}.${kind.ext}`, buffer, {
          access: 'public',
          contentType: kind.contentType,
        });
        mapScreenshotUrl = blob.url;
        console.log("[MAP_SCREENSHOT_UPLOADED]", lead.id, "size:", Math.round(buffer.length / 1024), "KB");
      } catch (uploadError) {
        console.error("[MAP_SCREENSHOT_UPLOAD_ERROR]", uploadError instanceof Error ? uploadError.message : uploadError);
        // Continue without screenshot - don't fail the lead capture
      }
    }

    // Parse address components
    const addressParts = lead.address ? parseAddress(lead.address) : {};

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
      'Slope Tier': priced.quote.slopeTier,
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
      'Map Screenshot': mapScreenshotUrl ? [{ url: mapScreenshotUrl }] : undefined,
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
      ? await sendQuoteEmail(lead.id, lead.email, lead.address ?? '', lead.brand, inputs, priced)
      : false;

    record.emailSent = emailSent;

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

    // Something broke on this side. A 400 here told the client its payload was
    // bad and the queue dropped the lead; a malformed request is rejected by
    // the explicit checks above, so anything reaching here is ours to fix and
    // theirs to retry. A store that is down says so specifically.
    // Give the lease back so the retry is not told it is already in progress.
    if (heldLease) await releaseLease(heldLease.key, heldLease.token);

    const status = e instanceof StoreUnavailable ? 503 : 502;
    return NextResponse.json(
      { ok: false, leadFiled: false, emailSent: false, error: msg || "server_error" },
      { status }
    );
  }
}
