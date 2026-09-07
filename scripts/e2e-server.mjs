/**
 * Start the server the e2e suite runs against, once, even if two runs ask.
 *
 * Playwright checks the URL before running this command, so two suites started
 * within a second of each other both find nothing listening and both run
 * `next build` — into the same `.next`. The result is a half-written build that
 * either refuses to boot or, worse, boots and serves a broken bundle, and the
 * suite comes back with a scatter of unrelated timeouts at two or three times
 * its usual wall-clock. It took me four occurrences and one wrong diagnosis to
 * stop blaming the application for it.
 *
 * A note in the runbook did not prevent that. This does: the build is behind an
 * atomic lock, and a run that loses the race waits for the winner's server
 * rather than trampling it.
 *
 * Usage: node scripts/e2e-server.mjs <port>
 */

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PORT = process.argv[2] ?? '3100';
const URL = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(import.meta.dirname, '..');
const LOCK = path.join(ROOT, '.next-build.lock');

/** How long to wait for the other run's build before giving up on it. */
const LOCK_TIMEOUT_MS = 600_000;
const STALE_LOCK_MS = 900_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function serverAnswers() {
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(2000) });
    return res.status > 0;
  } catch {
    return false;
  }
}

/** mkdir is atomic: exactly one caller can create the directory. */
function takeLock() {
  try {
    mkdirSync(LOCK);
    writeFileSync(path.join(LOCK, 'pid'), String(process.pid));
    return true;
  } catch {
    // A lock left behind by a killed run would block every future run.
    try {
      if (Date.now() - statSync(LOCK).mtimeMs > STALE_LOCK_MS) {
        rmSync(LOCK, { recursive: true, force: true });
        return takeLock();
      }
    } catch {
      /* racing another cleanup; fall through and wait */
    }
    return false;
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', cwd: ROOT });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${code}`))));
  });
}

const NEXT = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');

if (await serverAnswers()) {
  // Somebody is already serving. Idle, so Playwright sees a live command and a
  // live URL, and let their server do the work.
  console.log(`[e2e-server] ${URL} already answers; reusing it.`);
  await new Promise(() => {});
}

if (takeLock()) {
  try {
    console.log('[e2e-server] building');
    await run(process.execPath, [NEXT, 'build']);
  } finally {
    rmSync(LOCK, { recursive: true, force: true });
  }
  /*
    Check again before binding the port.

    The lock only covers the build. A run that arrives while the winner is
    building waits, takes the freed lock, rebuilds — harmlessly, the output is
    the same — and would then try to start a second server on a port the
    winner is already serving from. That fails with EADDRINUSE and takes the
    whole suite down with it.
  */
  if (await serverAnswers()) {
    console.log(`[e2e-server] ${URL} came up while building; reusing it.`);
    await new Promise(() => {});
  }

  console.log(`[e2e-server] starting on ${PORT}`);
  await run(process.execPath, [NEXT, 'start', '--port', PORT]);
} else {
  console.log('[e2e-server] another run is building; waiting for its server');
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await serverAnswers()) {
      console.log(`[e2e-server] ${URL} is up; reusing it.`);
      await new Promise(() => {});
    }
    await sleep(1000);
  }
  throw new Error('the other run never produced a server');
}
