/**
 * What the funnel actually did, last week and last month.
 *
 * Opt-in and read-only. It needs POSTHOG_PERSONAL_API_KEY — a personal key,
 * not the public project key the browser uses — and does nothing at all
 * without one, so it is safe to leave wired into a repo that most people
 * cloning it cannot run.
 *
 *   npm run report:funnel
 *
 * Reads `.env.local` itself, so that is the whole command — there is nothing
 * to remember and nothing to paste into a shell where it would land in the
 * history file. **Never commit the key.** `.env.local` is gitignored; keep it
 * that way.
 *
 * Writes docs/reports/YYYY-MM-DD.md. Committing those is the point: a drop-off
 * number is only useful next to the one from a fortnight ago.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { STEPS } from '../src/config/copy';

/**
 * Fill blanks from `.env.local`, without overriding anything already set.
 *
 * Hand-rolled rather than a dependency, and deliberately *not*
 * `process.loadEnvFile`: that one overwrites, which would mean a deliberate
 * `POSTHOG_PROJECT_ID=other npm run report:funnel` was silently ignored in
 * favour of the file. Explicit beats ambient; the file is the fallback.
 */
function loadEnvLocal(): void {
  let text: string;
  try {
    // Synchronous, because this has to finish before the constants below are
    // read and tsx compiles this file to CommonJS, where there is no
    // top-level await to wait for it with.
    text = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  } catch {
    // No file is not an error. The variables may come from the environment.
    return;
  }

  for (const line of text.split('\n')) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, name, rawValue] = match;
    if (process.env[name] !== undefined && process.env[name] !== '') continue;
    // Strip one layer of matching quotes, and anything after an unquoted #.
    const value = rawValue.trim().replace(/^(['"])([^]*)\1$/, '$2');
    process.env[name] = /^['"]/.test(rawValue.trim()) ? value : value.split(' #')[0].trim();
  }
}

loadEnvLocal();

const KEY = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
const HOST = (process.env.POSTHOG_HOST || 'https://us.posthog.com').replace(/\/$/, '');
const PROJECT = process.env.POSTHOG_PROJECT_ID?.trim();

/**
 * The funnel, in the order a customer walks it.
 *
 * Read from copy.ts rather than typed out again — an earlier version of this
 * file had its own list, and four of the six names were wrong, so the report
 * labelled real drop-off with steps that do not exist.
 */
const STEP_NAMES = STEPS.map((step) => step.title);

const WINDOWS = [7, 30] as const;

interface QueryResult {
  results: unknown[][];
  columns?: string[];
}

/**
 * One HogQL query.
 *
 * HogQL rather than the insights API on purpose: the questions here are
 * arithmetic over events, and expressing them as SQL keeps them readable and
 * reviewable in this file instead of scattered across saved insights in a UI
 * nobody diffs.
 */
async function query(sql: string): Promise<QueryResult> {
  const res = await fetch(`${HOST}/api/projects/${PROJECT}/query/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: sql } }),
  });
  if (!res.ok) {
    throw new Error(`PostHog ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as QueryResult;
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

// --- Airtable ---------------------------------------------------------------

interface LeadRecord {
  id: string;
  fields: Record<string, unknown>;
}

/**
 * Every lead in the window, one page at a time.
 *
 * The reporting reads Airtable directly rather than going through
 * `src/lib/airtable.ts`: that module writes, and its one exported call is an
 * upsert. A report has no business importing something that can PATCH the
 * owner's base.
 *
 * `filterByFormula` on the created time rather than fetching everything and
 * filtering here — the base grows and the pages do not.
 */
async function fetchLeads(days: number): Promise<LeadRecord[]> {
  const key = process.env.AIRTABLE_API_KEY?.trim();
  const base = process.env.AIRTABLE_BASE_ID?.trim();
  if (!key || !base) return [];

  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const out: LeadRecord[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`https://api.airtable.com/v0/${base}/Leads`);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('filterByFormula', `IS_AFTER(CREATED_TIME(), '${since}')`);
    if (offset) url.searchParams.set('offset', offset);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) {
      throw new Error(`Airtable ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = (await res.json()) as { records?: LeadRecord[]; offset?: string };
    out.push(...(json.records ?? []));
    offset = json.offset;
  } while (offset);

  return out;
}

/** The middle value. Returns null for an empty set rather than 0, which lies. */
function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The value below which `p` of the set falls. */
function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[index];
}

const signedPct = (fraction: number): string =>
  `${fraction >= 0 ? '+' : ''}${(fraction * 100).toFixed(1)}%`;

/**
 * Fewer than this and the answer is noise dressed as a number.
 *
 * Five is the owner's figure. It is low, and deliberately so — the point of
 * the section is to start being able to see the error, not to publish it.
 */
const MIN_ACCURACY_RECORDS = 5;

/**
 * How wrong the estimate was, once somebody went and looked.
 *
 * `Actual Quote` and `Actual Trench Ft` are filled in by the owner after a
 * site visit and by nothing else — no code path writes them, which is the
 * whole point: a column the app could write would eventually be written by the
 * app, and then it would be measuring itself.
 *
 * Reported as a signed fraction of the actual, so "+12%" reads as "we quoted
 * twelve per cent high". The spread is the 10th and 90th percentile rather
 * than a standard deviation: with a handful of records the distribution is not
 * normal and nobody should pretend it is.
 */
async function estimateAccuracy(days: number): Promise<string> {
  let leads: LeadRecord[];
  try {
    leads = await fetchLeads(days);
  } catch (error) {
    return `_Airtable could not be read: ${error instanceof Error ? error.message : error}_`;
  }

  const priced = leads
    .map((r) => {
      const low = num(r.fields['Price Low']);
      const high = num(r.fields['Price High']);
      const actual = num(r.fields['Actual Quote']);
      // The midpoint is the estimate the server filed; low and high are that
      // figure spread either side by a fixed percentage.
      return { estimate: (low + high) / 2, actual };
    })
    .filter((r) => r.estimate > 0 && r.actual > 0)
    .map((r) => (r.estimate - r.actual) / r.actual);

  const trench = leads
    .map((r) => ({
      estimate: num(r.fields['Trenching Distance ft']),
      actual: num(r.fields['Actual Trench Ft']),
    }))
    .filter((r) => r.estimate > 0 && r.actual > 0)
    .map((r) => (r.estimate - r.actual) / r.actual);

  const lines: string[] = [];

  for (const [label, set] of [
    ['Price', priced],
    ['Trench feet', trench],
  ] as const) {
    if (set.length < MIN_ACCURACY_RECORDS) {
      lines.push(
        `- **${label}:** not enough data — ${set.length} of ${MIN_ACCURACY_RECORDS} needed.`
      );
      continue;
    }
    const mid = median(set)!;
    const low = percentile(set, 0.1)!;
    const high = percentile(set, 0.9)!;
    lines.push(
      `- **${label}:** median ${signedPct(mid)}, ` +
        `10th-90th ${signedPct(low)} to ${signedPct(high)} (n=${set.length}).`
    );
  }

  lines.push('');
  lines.push(
    '> Positive means the estimate was **above** what the job actually came to. ' +
      'Percentiles rather than a standard deviation: with this few records the ' +
      'distribution is not normal and should not be described as if it were.'
  );
  return lines.join('\n');
}

/**
 * Where the leads came from, and what became of them.
 *
 * Source and UTM Source are separate columns and separate questions — `source`
 * is which partner funnel they walked through, `utm_source` is which ad paid
 * for it — so this reports both rather than merging them into a guess.
 */
async function outcomesBySource(days: number): Promise<string> {
  let leads: LeadRecord[];
  try {
    leads = await fetchLeads(days);
  } catch (error) {
    return `_Airtable could not be read: ${error instanceof Error ? error.message : error}_`;
  }
  if (!leads.length) return '_No leads in this window._';

  const statuses = [...new Set(leads.map((r) => String(r.fields.Status ?? 'unset')))].sort();

  const table = (column: string, title: string): string => {
    const byKey = new Map<string, Map<string, number>>();
    for (const record of leads) {
      const key = String(record.fields[column] ?? '(none)') || '(none)';
      const status = String(record.fields.Status ?? 'unset');
      const row = byKey.get(key) ?? new Map<string, number>();
      row.set(status, (row.get(status) ?? 0) + 1);
      byKey.set(key, row);
    }

    const header = `| ${title} | ${statuses.join(' | ')} | Total |`;
    const rule = `| --- | ${statuses.map(() => '---:').join(' | ')} | ---: |`;
    const rows = [...byKey.entries()]
      .map(([key, counts]) => {
        const total = [...counts.values()].reduce((a, b) => a + b, 0);
        return { key, counts, total };
      })
      .sort((a, b) => b.total - a.total)
      .map(
        ({ key, counts, total }) =>
          `| \`${key}\` | ${statuses.map((s) => counts.get(s) ?? 0).join(' | ')} | ${total} |`
      );

    return [header, rule, ...rows].join('\n');
  };

  return [table('Source', 'Source'), '', table('UTM Source', 'UTM Source')].join('\n');
}

/**
 * What broke, and where people gave up.
 *
 * Two questions that belong together: an abandon with an exception a moment
 * before it is a bug, and an abandon without one is the screen being wrong.
 * Separating them into different sections would mean nobody ever looked at
 * both at once.
 */
async function errorsAndAbandons(days: number): Promise<string> {
  const exceptions = (
    await query(`
      SELECT
        concat(
          coalesce(toString(properties.$browser), 'unknown'),
          ' / ',
          coalesce(toString(properties.$device_type), 'unknown')
        ) AS where_,
        coalesce(toString(properties.$exception_message), '(no message)') AS message,
        count() AS n
      FROM events
      WHERE event = '$exception' AND timestamp > now() - INTERVAL ${days} DAY
      GROUP BY where_, message
      ORDER BY n DESC
      LIMIT 15
    `)
  ).results;

  /*
    The last thing somebody did before they stopped.

    Restricted to funnels that reached step 4 — earlier than that an abandon is
    somebody who was never going to finish, and the interesting ones are the
    people who drew an array and then did not send it. `argMax` over the whole
    funnel rather than a window function, because there is exactly one answer
    per lead and no frame to reason about.
  */
  const abandons = (
    await query(`
      SELECT last_event, count() AS n FROM (
        SELECT
          properties.leadId AS lead,
          max(toInt(properties.step)) AS furthest,
          argMax(event, timestamp) AS last_event,
          countIf(event = 'lead_filed') AS filed
        FROM events
        WHERE timestamp > now() - INTERVAL ${days} DAY
          AND notEmpty(toString(properties.leadId))
        GROUP BY lead
      )
      WHERE furthest >= 3 AND filed = 0
      GROUP BY last_event
      ORDER BY n DESC
      LIMIT 15
    `)
  ).results;

  const parts: string[] = ['#### Exceptions'];
  if (!exceptions.length) {
    parts.push('_None. Nothing threw._');
  } else {
    parts.push('| Browser / device | Message | Count |', '| --- | --- | ---: |');
    for (const row of exceptions) {
      parts.push(
        `| ${String(row[0]).slice(0, 40)} | ${String(row[1]).replace(/\|/g, '\\|').slice(0, 90)} | ${num(row[2])} |`
      );
    }
  }

  parts.push('', '#### Reached the design step and never filed');
  if (!abandons.length) {
    parts.push('_Nobody got that far and left._');
  } else {
    parts.push('| Last thing they did | People |', '| --- | ---: |');
    for (const row of abandons) parts.push(`| \`${String(row[0])}\` | ${num(row[1])} |`);
    parts.push('');
    parts.push(
      '> Step 4 is where the array is drawn. Somebody who got that far and did ' +
        'not send it had already done the work, so the last event is worth reading.'
    );
  }

  return parts.join('\n');
}

/** People who reached each step, and how many of the previous step were lost. */
async function dropOff(days: number): Promise<string> {
  const rows = (
    await query(`
      SELECT
        toInt(properties.step) AS step,
        count(DISTINCT properties.leadId) AS people
      FROM events
      WHERE event = 'step_viewed'
        AND timestamp > now() - INTERVAL ${days} DAY
        AND notEmpty(toString(properties.leadId))
      GROUP BY step
      ORDER BY step
    `)
  ).results;

  const byStep = new Map<number, number>(rows.map((r) => [num(r[0]), num(r[1])]));
  const lines = ['| Step | Reached | Lost from previous |', '| --- | ---: | ---: |'];
  let previous: number | null = null;
  let sawRise = false;

  for (let i = 0; i < STEP_NAMES.length; i++) {
    const people = byStep.get(i) ?? 0;
    let lost: string;

    if (previous === null || previous === 0) {
      lost = '—';
    } else if (people > previous) {
      /*
        More people on this step than the one before it.

        Not a negative loss — the funnel is not strictly sequential. `?step=`,
        a resume link, `?demo=results` and every automated check land people
        directly on a later step without passing through the earlier ones. An
        earlier version printed "-50.0%" here, which reads as a gain and is
        nonsense either way.
      */
      lost = `+${people - previous} arrived directly`;
      sawRise = true;
    } else {
      lost = `${(((previous - people) / previous) * 100).toFixed(1)}%`;
    }

    lines.push(`| ${i + 1}. ${STEP_NAMES[i]} | ${people} | ${lost} |`);
    previous = people;
  }

  if (sawRise) {
    lines.push('');
    lines.push(
      '> A step reached by more people than the one before it means somebody ' +
        'arrived there directly — a `?step=` link, a resume link, or an ' +
        'automated check. Drop-off between those two steps cannot be read.'
    );
  }
  return lines.join('\n');
}

/**
 * Median seconds between arriving at a step and arriving at the next one.
 *
 * Median rather than mean: one person who left the tab open overnight would
 * otherwise make a ten-second step look like a four-hour one.
 *
 * `leadInFrame` is a window function and has to be written as one. The first
 * version of this called it bare, alongside a GROUP BY, and PostHog answered
 * "can only be used as a window function, not as an aggregate function" —
 * correctly, because without a frame there is no next row to look at.
 *
 * Two details in the OVER clause, both load-bearing:
 *
 *   PARTITION BY leadId  — the next step *this customer* reached. Without it
 *                          the frame runs across everybody and the gap becomes
 *                          the time to some stranger's next event.
 *   ROWS BETWEEN CURRENT ROW AND 1 FOLLOWING
 *                        — the default frame ends at the current row, so
 *                          `leadInFrame` would have nothing ahead of it and
 *                          return the zero value on every row.
 */
async function timePerStep(days: number): Promise<string> {
  const rows = (
    await query(`
      SELECT step, median(gap) AS seconds FROM (
        SELECT
          toInt(properties.step) AS step,
          dateDiff(
            'second',
            timestamp,
            leadInFrame(timestamp) OVER (
              PARTITION BY properties.leadId
              ORDER BY timestamp ASC
              ROWS BETWEEN CURRENT ROW AND 1 FOLLOWING
            )
          ) AS gap
        FROM events
        WHERE event = 'step_viewed'
          AND timestamp > now() - INTERVAL ${days} DAY
          AND notEmpty(toString(properties.leadId))
      )
      -- Drops the last step of every funnel, which has no next row and so a
      -- gap of zero, and anything over an hour, which is a tab left open
      -- rather than somebody reading the screen.
      WHERE gap > 0 AND gap < 3600
      GROUP BY step
      ORDER BY step
    `)
  ).results;

  if (!rows.length) return '_No step timings in this window._';
  const lines = ['| Step | Median time |', '| --- | ---: |'];
  for (const row of rows) {
    const step = num(row[0]);
    const seconds = Math.round(num(row[1]));
    lines.push(`| ${step + 1}. ${STEP_NAMES[step] ?? step} | ${seconds}s |`);
  }
  return lines.join('\n');
}

async function billSuccess(days: number): Promise<string> {
  const rows = (
    await query(`
      SELECT event, count() AS n
      FROM events
      WHERE event IN ('bill_upload_started', 'bill_upload_succeeded', 'bill_upload_failed', 'bill_manual_used')
        AND timestamp > now() - INTERVAL ${days} DAY
      GROUP BY event
    `)
  ).results;

  const counts = new Map<string, number>(rows.map((r) => [String(r[0]), num(r[1])]));
  const started = counts.get('bill_upload_started') ?? 0;
  const ok = counts.get('bill_upload_succeeded') ?? 0;
  const rate = started ? `${((ok / started) * 100).toFixed(1)}%` : '—';
  return [
    `- Uploads started: **${started}**`,
    `- Read successfully: **${ok}** (${rate})`,
    `- Failed: **${counts.get('bill_upload_failed') ?? 0}**`,
    `- Chose to type it in instead: **${counts.get('bill_manual_used') ?? 0}**`,
  ].join('\n');
}

/**
 * Where people jab at something that does not respond.
 *
 * PostHog's autocapture records rageclicks as `$rageclick` with the element in
 * `$el_text`, so this is the one report here that needs autocapture to be on.
 */
async function rageClicks(days: number): Promise<string> {
  const rows = (
    await query(`
      SELECT
        coalesce(nullIf(toString(properties.$el_text), ''), toString(properties.$event_type), 'unknown') AS target,
        count() AS n
      FROM events
      WHERE event = '$rageclick' AND timestamp > now() - INTERVAL ${days} DAY
      GROUP BY target
      ORDER BY n DESC
      LIMIT 10
    `)
  ).results;

  if (!rows.length) return '_None. Nobody jabbed at anything._';
  return rows.map((r) => `- \`${String(r[0]).slice(0, 80)}\` — ${num(r[1])}`).join('\n');
}

async function leads(days: number): Promise<number> {
  const rows = (
    await query(`
      SELECT count(DISTINCT properties.leadId)
      FROM events
      WHERE event = 'lead_filed' AND timestamp > now() - INTERVAL ${days} DAY
    `)
  ).results;
  return num(rows[0]?.[0]);
}

async function section(days: number): Promise<string> {
  const [drop, timing, bills, rage, count, accuracy, outcomes, errors] = await Promise.all([
    dropOff(days),
    timePerStep(days),
    billSuccess(days),
    rageClicks(days),
    leads(days),
    estimateAccuracy(days),
    outcomesBySource(days),
    errorsAndAbandons(days),
  ]);

  return `## Last ${days} days

**Leads filed: ${count}**

### Step by step

${drop}

### Median time per step

${timing}

### Bill upload

${bills}

### Rage clicks

${rage}

### Estimate accuracy

${accuracy}

### Outcomes by source

${outcomes}

### Errors and abandons

${errors}
`;
}

async function main(): Promise<void> {
  if (!KEY) {
    console.log(
      'POSTHOG_PERSONAL_API_KEY is not set, so there is nothing to report on. Skipping.'
    );
    return;
  }
  if (!PROJECT) {
    console.error('POSTHOG_PROJECT_ID is required alongside the personal key.');
    process.exitCode = 1;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const sections = await Promise.all(WINDOWS.map(section));

  const body = `# Funnel report — ${today}

Generated by \`scripts/funnel-report.ts\`. Behaviour comes from PostHog and
counts distinct lead ids rather than browsers — one person who reloads four
times is one. Estimate accuracy and outcomes come from Airtable, which is the
only place the owner's own figures live.

${sections.join('\n')}
`;

  const dir = path.join(process.cwd(), 'docs', 'reports');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${today}.md`);
  await writeFile(file, body, 'utf8');
  console.log(`Wrote ${path.relative(process.cwd(), file)}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
