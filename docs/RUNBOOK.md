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
| `NEXT_PUBLIC_DEMO_PARAMS` | Vercel, **Preview only** | Without it `?demo=results` does nothing. Set it to `1` on Preview so the results screen can be reviewed without filing a lead. **Never set it on Production**: the screen it opens claims a quote was produced. |
| `ANTHROPIC_MODEL` | Vercel (optional) | Defaults to `claude-sonnet-5`. Change the model without a code change. |
| `ALLOWED_FRAME_ORIGINS` | Vercel (optional) | `frame-ancestors *`, which is deliberate: partner funnels embed this. Set a space-separated origin list to lock it down. |

Check what a deployment actually has: `GET /api/health`.

```json
{"ok":true,"env":{"hasResend":true,"hasMapbox":true,"hasAirtable":true,
"hasNrel":true,"hasRedis":true,"hasNotifyEmail":false}}
```

Booleans only, deliberately: an unauthenticated caller has no reason to learn
the owner's notification address from us.

---

## URL parameters

| Parameter | Does | Example |
|---|---|---|
| `?reset=1` | Clears the persisted funnel and starts fresh. The way out of a stuck state. | `/quote?reset=1` |
| `?step=N` | Jumps to a step (0–5). Authoritative over the persisted position, so it is how you test one screen. Forward jumps past the furthest validated step are refused. | `/quote?step=3` |
| `?brand=` | Which brand the funnel wears: `groundmounts` or `neutral`. Anything else falls back to the default. Decides the email sender and the logo. | `/quote?brand=neutral` |
| `?source=` | **Attribution only.** Recorded in Airtable's Source field. Deliberately cannot pick a brand — otherwise any URL could decide what a customer's email claimed to be from. | `/quote?source=partnersite.com` |
| `?zipcode=` | Pre-fills the address search. | `/quote?zipcode=76086` |
| `?partial=1` | Header/query hint that a POST to `/api/leads` is a partial save. Set by the client as `x-gm-partial: 1`; the body's `partial: true` works too. | — |

The client also sends the honeypot as `x-gm-hp` alongside the body field, so
the server's pre-parse check applies to real traffic rather than only to
whatever a bot chooses to send. Both are checked.
| `?state=` | Sets the state on the lead. Defaults to `TX`. | `/quote?state=TX` |
| `?demo=results` | **Preview only.** Seeds a worked example and opens the revealed success screen, with the results section, **without sending anything** — no Airtable write, no email, no request to `/api/leads` at all. Needs `NEXT_PUBLIC_DEMO_PARAMS=1`; without it the parameter does nothing. | `/quote?demo=results` |

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

### `npm run verify:hooks`

Greps the built output for `__gmTest`, `__gmLastPointer` and
`data-upload-bytes`. These are e2e hooks — `__gmTest` hands out the whole store
and the live map camera — and they are behind
`process.env.NEXT_PUBLIC_E2E_HOOKS === '1'`, a flag only `playwright.config.ts`
sets. `next.config.mjs` declares the variable so an unset flag compiles to a
literal `"" === "1"` and the branch is dropped; without that declaration Next
leaves it as a runtime lookup and the hook ships.

Run it after `next build`. Exit 1 means a hook reached the bundle.

### Reviewing the results screen without filing a lead

`/quote?demo=results` on a Preview deployment. It seeds a coherent worked
example, opens the success screen already revealed, and makes no request of
any kind — the e2e asserts zero calls to `/api/leads` and that `leadFiled`
stays null, so nothing claims to have been filed.

The gate is `NEXT_PUBLIC_DEMO_PARAMS === '1'`, checked in `demoMode.ts`. There
is deliberately **no** build-level check for this in `verify:hooks`: the flag
inlines to a literal whether it was set or not, so the variable name is absent
from the bundle either way and the demo seed survives both builds. A check that
passes in both directions is worse than none. What guards it instead:

- `demoMode.test.ts` — the gate returns null for every value that is not
  exactly `"1"`, including `"0"`, `"true"` and `"preview"`.
- The e2e runs `?demo=results` against **both** a flagged and an unflagged
  server. The default run has the flag on; the other half is:

  ```bash
  E2E_DEMO_PARAMS= E2E_PORT=3101 npx playwright test -g "flag is off"
  ```

### Capturing the results screen

`e2e/screenshots.spec.ts`, excluded from the normal run because it writes files
and asserts almost nothing:

```bash
npx playwright test --project=mobile --project=desktop e2e/screenshots.spec.ts
```

Writes to `docs/screenshots/`. It stubs `/api/leads` to fail loudly, so a
capture that somehow submitted would be obvious rather than quietly landing in
the owner's Airtable.

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

Nothing is a placeholder any more. Every figure below is owner-confirmed as of
this commit; anything added later that is not should be marked `PLACEHOLDER`
and shipped `enabled: false`.

| What | Value |
|---|---|
| Standard panel | Mission Solar MSX10-435HN0B, 435 W, $3.50/W |
| Premium panel | REC Alpha Pure-RX, 460 W, $4.00/W — **`enabled: false`** |
| Racking, tilt | 30° |
| Trench base rate | $45/ft |
| Conduit schedule | ≤10 kW ×1.00 · 10–20 kW ×1.05 · >20 kW ×1.20 |
| Battery trench adder | +0.05 on the multiplier — unreachable while battery is off |
| Battery | Tesla Powerwall 3 — **`enabled: false`** |
| Slope adders | the customer's answer: Flat +0% · Slight +5% · Big +10% |
| Rocky adder | the customer's answer: +10% |
| Vegetation clearing | $1,500 flat to 0.25 acre, then $2,500/acre |
| Range spread | ±8% |

**The ground is priced from what the customer says, not from what the survey
found.** Phase 9. The terrain and SSURGO lookups still run: they pre-select the
answers on the options step and they still land on the lead as `Slope Tier`,
`Slope %` and `Soil Class`, so the owner can see where the customer disagreed
with the map. They no longer decide the number. A DEM tile sampled at 200 ft
has no way to know about the ledge under the corner of the field, and it was
quietly moving a five-figure figure on the customer's behalf.

The three things a browser can move here are bounded server-side:
`slopeAnswer` must be one of `flat` / `slight` / `big` (an unrecognised value
is refused; an absent one defaults to `flat`, so a cached bundle still gets a
quote), and `rocky` and `batteryInterest` are strict booleans. Nothing else
from the client touches site pricing.

**Battery interest is recorded, not priced.** The options step asks whether the
customer wants to hear about batteries and generators; the answer reaches
Airtable as `Battery Interest` and changes no number.

Clay, loam and sand are **absent** from `soilAdders` rather than present with a
zero — an explicit zero invites somebody to tidy the config by giving them a
value.

**To switch an option on**, set `enabled: true` in `pricing.ts`. It then appears
on step 5, is priced, and reaches the lead. Nothing else needs changing.

---

## Running the e2e suite

`playwright.config.ts` builds and starts a **production** server rather than
running `next dev`. The dev server compiles routes on demand, and with four
workers hydrating against them a page could sit in compilation long enough to
miss a navigation budget — failures that were green in isolation and had
nothing to do with the app.

Two consequences:

- The first run of a session pays for a `next build` (hence the 600s webServer
  budget). Later runs reuse the running server.
- **Two suites can cold-start at once.** `scripts/e2e-server.mjs` puts the
  build behind an atomic lock: the run that wins builds and serves, and the one
  that loses waits for that server instead of building over it.

  Before that lock existed, two concurrent cold starts wrote into the same
  `.next`, and the half-written build either refused to boot with
  `SyntaxError: Unexpected end of JSON input` or — worse — booted and served a
  broken bundle, producing a scatter of unrelated timeouts at two to three
  times the usual wall-clock. It happened four times and cost one wrong
  diagnosis, blamed on a phase that had nothing to do with it. A note here did
  not stop it; the lock does.

The `interaction` and `desktop-map` projects render real WebGL through
SwiftShader, which is CPU rasterisation. They are configured to run alone
(`dependencies`, `fullyParallel: false`) for that reason, and **two copies of
them cannot share a machine** — the second starves the first's renderer and the
drag-drift assertions fail with a several-hundred-millisecond worst frame,
which the failure message reports.

---

## Known advisories

`npm audit` reports two, and CI runs it report-only so they stay visible
without blocking a deploy the morning a transitive advisory lands.

**postcss (high) — via `next`.** Four related issues, all about
`sourceMappingURL` in CSS comments causing arbitrary `.map` file reads, plus
XSS via an unescaped `</style>` in stringify output.

**Deferred, deliberately.** Every one of them requires an attacker to control
CSS that PostCSS then processes. PostCSS runs here at **build time only**,
over Tailwind's output and our own stylesheets — there is no path by which a
customer's input reaches it, and nothing user-supplied is ever compiled. The
fix is `npm audit fix --force`, which installs **next@16.3.4, a major version
bump** across the App Router, the map shell and the whole test suite.

Taking a breaking framework upgrade to close a build-time issue with no
reachable path would be trading a real regression risk for a theoretical one.
Revisit when Next is upgraded for its own reasons, or immediately if the app
ever starts processing CSS it did not author.

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
npm run verify:hooks
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
