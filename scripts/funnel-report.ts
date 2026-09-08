/**
 * What the funnel actually did, last week and last month.
 *
 * Opt-in and read-only. It needs POSTHOG_PERSONAL_API_KEY — a personal key,
 * not the public project key the browser uses — and does nothing at all
 * without one, so it is safe to leave wired into a repo that most people
 * cloning it cannot run.
 *
 *   POSTHOG_PERSONAL_API_KEY=phx_... npm run report:funnel
 *
 * Writes docs/reports/YYYY-MM-DD.md. Committing those is the point: a drop-off
 * number is only useful next to the one from a fortnight ago.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const KEY = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
const HOST = (process.env.POSTHOG_HOST || 'https://us.posthog.com').replace(/\/$/, '');
const PROJECT = process.env.POSTHOG_PROJECT_ID?.trim();

/** The funnel, in the order a customer walks it. */
const STEP_NAMES = [
  'Find your property',
  'Your power use',
  'Where the power comes in',
  'Place your panels',
  'A few questions',
  'Your quote',
];

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
  for (let i = 0; i < STEP_NAMES.length; i++) {
    const people = byStep.get(i) ?? 0;
    const lost =
      previous === null || previous === 0
        ? '—'
        : `${(((previous - people) / previous) * 100).toFixed(1)}%`;
    lines.push(`| ${i + 1}. ${STEP_NAMES[i]} | ${people} | ${lost} |`);
    previous = people;
  }
  return lines.join('\n');
}

/**
 * Median seconds between arriving at a step and arriving at the next one.
 *
 * Median rather than mean: one person who left the tab open overnight would
 * otherwise make a ten-second step look like a four-hour one.
 */
async function timePerStep(days: number): Promise<string> {
  const rows = (
    await query(`
      SELECT step, median(gap) AS seconds FROM (
        SELECT
          toInt(properties.step) AS step,
          dateDiff('second', timestamp, leadInFrame(timestamp)) AS gap
        FROM events
        WHERE event = 'step_viewed'
          AND timestamp > now() - INTERVAL ${days} DAY
          AND notEmpty(toString(properties.leadId))
        GROUP BY properties.leadId, step, timestamp
        ORDER BY properties.leadId, timestamp
      )
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
  const [drop, timing, bills, rage, count] = await Promise.all([
    dropOff(days),
    timePerStep(days),
    billSuccess(days),
    rageClicks(days),
    leads(days),
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

Generated by \`scripts/funnel-report.ts\` from PostHog. Every figure counts
distinct lead ids, not browsers: one person who reloads four times is one.

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
