# Runbook

How to run, configure and ship this thing.

---

## Environment variables

Everything degrades rather than crashes. The table says what actually breaks
when a variable is missing, because "required" is rarely the whole truth.

| Variable | Where | Without it |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Vercel + `.env.local` | **The tool does not work.** No map, no address search, no design. This is the one hard dependency. |
| `AIRTABLE_API_KEY`<br>`AIRTABLE_BASE_ID` | Vercel + `.env.local` | Leads are not saved. The customer sees "Did not go through" and the queue retries. Partial saves fail silently, as designed. |
| `AIRTABLE_TABLE_ID` | Vercel | The owner's notification email links to the base rather than the record. Cosmetic. |
| `RESEND_API_KEY` | Vercel | No quote email and no owner notification. The lead is still filed and the response says `emailSent: false`, so the retry chases it. |
| `NOTIFY_EMAIL` | Vercel (optional) | New-lead notifications go to `bert@groundmounts.com`. |
| `NREL_API_KEY` | Vercel + `.env.local` | Every quote uses the generic Texas production curve instead of the customer's own coordinates. Silent — check `/api/health` (`hasNrel`) or look for `"curveSource":"fallback"`. |
| `ANTHROPIC_API_KEY` | Vercel + `.env.local` | Bill upload fails politely; customers type their usage in. Also disables `npm run eval:bills`. |
| `KV_REST_API_URL`<br>`KV_REST_API_TOKEN`<br>*(or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`)* | Vercel + `.env.local` | Rate limiting, the site cache and submit idempotency all fall back to per-instance memory. Nothing breaks, but each of them becomes per-instance: duplicate submits can slip through and the site cache stops being shared. |
| `BLOB_READ_WRITE_TOKEN` | Vercel (auto) | Map screenshots are not attached to leads. The lead is still filed. |
| `NEXT_PUBLIC_BRAND` | Vercel | Defaults to `groundmounts`. Set to `neutral` for a brandless deployment. |
| `ANTHROPIC_MODEL` | Vercel (optional) | Defaults to `claude-sonnet-5`. Change the model without a code change. |
| `ALLOWED_FRAME_ORIGINS` | Vercel (optional) | `frame-ancestors *`, which is deliberate: partner funnels embed this. Set a space-separated origin list to lock it down. |

Check what a deployment actually has: `GET /api/health`.

```json
{"ok":true,"env":{"hasResend":true,"hasMapbox":true,"hasAirtable":true,
"hasNrel":true,"hasRedis":true,"notifyEmail":"bert@groundmounts.com"}}
```

---

## URL parameters

| Parameter | Does | Example |
|---|---|---|
| `?reset=1` | Clears the persisted funnel and starts fresh. The way out of a stuck state. | `/quote?reset=1` |
| `?step=N` | Jumps to a step (0–5). Authoritative over the persisted position, so it is how you test one screen. Forward jumps past the furthest validated step are refused. | `/quote?step=3` |
| `?brand=` | Which brand the funnel wears: `groundmounts` or `neutral`. Anything else falls back to the default. Decides the email sender and the logo. | `/quote?brand=neutral` |
| `?source=` | **Attribution only.** Recorded in Airtable's Source field. Deliberately cannot pick a brand — otherwise any URL could decide what a customer's email claimed to be from. | `/quote?source=partnersite.com` |
| `?zipcode=` | Pre-fills the address search. | `/quote?zipcode=76086` |
| `?state=` | Sets the state on the lead. Defaults to `TX`. | `/quote?state=TX` |

---

## Scripts

### `npm run verify:airtable`

Diffs the live Leads table against what the app writes. Runs inside
`npm run test`, so a schema mismatch fails the gate.

- Exit 0 — the base matches.
- Exit 1 — a field is missing or the wrong type. **Every lead write will 422.**
- Exit 2 — could not check (no credentials, no network, wrong table). Not the
  same as a pass. Missing credentials skip rather than fail, so a contributor
  without them is not told their branch is broken.

### `npm run verify:airtable -- --create-missing`

Creates the columns the app needs and the base does not have, with the right
type, precision and select options. **Creation only** — there is no code path
that edits or deletes a field, so a column that exists with the wrong type is
reported and left alone for you to decide about.

Airtable will not let the API add an option to an existing single-select. Those
are reported as a warning, and every write uses `typecast`, so the first record
carrying a new value creates it.

### `npm run eval:bills`

Runs the four fixture bills in `e2e/fixtures/bills/` through the **real** model
and diffs against hand-read values in `expected.ts`. Needs `ANTHROPIC_API_KEY`
and costs money, which is why it is not in `npm test`.

It is the only thing that can tell you whether extraction still works. Run it
after changing the prompt, the schema, or the model.

```
bill-retail.png — Retail REP statement with a 13-bar usage history chart
  months: 12
  every kWh figure matches the page
  rate: 0.1609 (expected ~0.1609)
  PASS
```

---

## Where the placeholders live

All of it is in **`src/config/pricing.ts`**, and a unit test fails if a money
figure appears anywhere else. Anything marked `PLACEHOLDER` is a plausible
seed, not a quote.

| What | Currently | Status |
|---|---|---|
| Standard panel (Mission Solar 435 W, $3.50/W) | live | **Owner-confirmed** |
| Racking, tilt 30° | live | **Owner-confirmed** |
| Trench base rate, $45/ft | live | Confirmed |
| Conduit schedule (six rows of multipliers) | live | **PLACEHOLDER** |
| Premium panel (460 W, $3.95/W) | `enabled: false` | **PLACEHOLDER — not offered** |
| Battery (13.5 kWh, $12,500) | `enabled: false` | **PLACEHOLDER — not offered** |
| Slope adders (6% rolling, 15% steep) | live | **PLACEHOLDER** |
| Soil adders (rock 12%, caliche 10%, clay 2%) | live | **PLACEHOLDER** |
| Vegetation clearing ($3,200/acre, $850 min) | `enabled: true` | **PLACEHOLDER but offered** |
| Range spread, ±8% | live | Deliberate |

**To switch an option on**, set `enabled: true` in `pricing.ts`. It then appears
on step 5, is priced, and reaches the lead. Nothing else needs changing.

---

## Deploying

Preview:

```bash
npx vercel            # any branch, gives a preview URL
```

Promote `v2` to production:

```bash
git checkout v2
npm run test          # lint, typecheck, unit tests, Airtable schema
npm run build
npx playwright test
npx vercel --prod
```

Then check the deployment: `/api/health` reports the right flags, `/quote`
returns 200, and `/api/site?lat=32.7555&lng=-97.3208` reports
`"curveSource":"pvwatts"` rather than `"fallback"`.

Rolling back is a Vercel dashboard action — promote the previous deployment.
Nothing in this app writes migrations, so a rollback is safe.

---

## When something is wrong

**Leads are not arriving.** Check `/api/health` for `hasAirtable`. Run
`npm run verify:airtable`. Look for `[AIRTABLE_ERROR]` in the Vercel logs — the
reason is logged, the payload never is.

**Quotes are all the same shape.** `"curveSource":"fallback"` means PVWatts is
not being reached: check `NREL_API_KEY`, and that the host in
`src/config/apis.ts` still resolves. It moved once already.

**A customer says they got no email.** The lead response records
`emailSent`. If it is false the queue retries with `resend`, which sends to the
stored address only. Check the Resend dashboard for the idempotency key
`gm:quote:{leadId}`.

**Duplicate leads.** Should be impossible: submits are idempotent for 24 hours
on `leadId`. If it happens, check whether Redis was configured — without it,
idempotency is per-instance.

**The funnel is stuck for one customer.** Send them `/quote?reset=1`.
