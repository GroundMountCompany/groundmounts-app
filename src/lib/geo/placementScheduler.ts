import type { Feature, Polygon } from 'geojson';

export interface PlacementHost {
  /** True when the map has already settled and will emit no further idle. */
  isIdle(): boolean;
  onIdle(fn: () => void): void;
  offIdle(fn: () => void): void;
  /** Building footprints currently rendered. May legitimately be empty. */
  queryObstacles(): Array<Feature<Polygon>>;
}

export interface SchedulerOptions {
  /** Hard ceiling on waiting for buildings to show up. */
  timeoutMs?: number;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
}

/**
 * Decide when to auto-place the array.
 *
 * Buildings only exist in `queryRenderedFeatures` once tiles have drawn, so
 * placing immediately risks dropping the array on the house. But waiting for
 * buildings to appear is a trap on rural parcels, where there are none and the
 * wait never ends — the previous version chained a second `once('idle')`, which
 * on an already-idle map fires never.
 *
 * So: place as soon as buildings are seen, and otherwise place anyway when the
 * bounded wait expires. An empty obstacle list is a valid answer, not a reason
 * to hang. Returns a cancel function.
 */
export function scheduleAutoPlacement(
  host: PlacementHost,
  commit: (obstacles: Array<Feature<Polygon>>) => void,
  options: SchedulerOptions = {}
): () => void {
  const {
    timeoutMs = 1500,
    setTimeoutFn = ((fn: () => void, ms: number) => setTimeout(fn, ms)) as NonNullable<
      SchedulerOptions['setTimeoutFn']
    >,
    clearTimeoutFn = ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>)) as NonNullable<
      SchedulerOptions['clearTimeoutFn']
    >,
  } = options;

  let done = false;
  let timer: unknown = null;

  const finish = (obstacles: Array<Feature<Polygon>>) => {
    if (done) return;
    done = true;
    if (timer !== null) clearTimeoutFn(timer);
    host.offIdle(attempt);
    commit(obstacles);
  };

  function attempt() {
    if (done) return;
    const obstacles = host.queryObstacles();
    // Anything found is good enough; keep waiting only while we have nothing.
    if (obstacles.length > 0) finish(obstacles);
  }

  // The deadline runs regardless of whether any idle ever arrives.
  timer = setTimeoutFn(() => {
    timer = null;
    finish(done ? [] : host.queryObstacles());
  }, timeoutMs);

  host.onIdle(attempt);
  // An already-idle map emits nothing further, so probe it now.
  if (host.isIdle()) attempt();

  return () => {
    if (done) return;
    done = true;
    if (timer !== null) clearTimeoutFn(timer);
    host.offIdle(attempt);
  };
}
