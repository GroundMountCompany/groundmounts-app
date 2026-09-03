import type mapboxgl from 'mapbox-gl';

/** Below this many distinct sampled luminances the frame is treated as blank. */
const MIN_DISTINCT_LUMINANCES = 4;
const SAMPLE_STRIDE = 37; // prime-ish, avoids sampling a repeating grid

/**
 * True if the canvas looks like real imagery rather than a blank or solid frame.
 *
 * Some Android GPUs hand back an empty buffer from a WebGL canvas even after
 * the map reports idle. Submitting that produces a lead with a black rectangle
 * attached, which is worse than no image at all.
 */
export function looksRendered(
  data: Uint8ClampedArray,
  minDistinct = MIN_DISTINCT_LUMINANCES
): boolean {
  const seen = new Set<number>();
  for (let i = 0; i < data.length; i += 4 * SAMPLE_STRIDE) {
    const a = data[i + 3];
    if (a === 0) continue; // fully transparent pixel
    // Coarse luminance bucket: tolerant of compression noise, strict on "flat".
    const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    seen.add(lum >> 3);
    if (seen.size >= minDistinct) return true;
  }
  return false;
}

export interface CaptureResult {
  dataUrl: string | null;
  reason?: 'blank' | 'error' | 'no-canvas';
}

/**
 * Capture the map as a PNG data URL.
 *
 * Reads the WebGL canvas directly, which only works because the array, trench
 * and their labels are real Mapbox layers rather than DOM overlays — that is
 * what let html2canvas go. Requires `preserveDrawingBuffer: true` on the map.
 *
 * Never throws: a lead without a screenshot is worth far more than a failed
 * submit.
 */
export async function captureMap(map: mapboxgl.Map | null): Promise<CaptureResult> {
  if (!map) return { dataUrl: null, reason: 'no-canvas' };

  try {
    await waitForIdle(map);
    const canvas = map.getCanvas();
    if (!canvas || !canvas.width || !canvas.height) {
      return { dataUrl: null, reason: 'no-canvas' };
    }

    const probe = document.createElement('canvas');
    probe.width = canvas.width;
    probe.height = canvas.height;
    const ctx = probe.getContext('2d');
    if (ctx) {
      ctx.drawImage(canvas, 0, 0);
      const { data } = ctx.getImageData(0, 0, probe.width, probe.height);
      if (!looksRendered(data)) {
        console.warn('[SCREENSHOT] canvas came back blank; submitting without it');
        return { dataUrl: null, reason: 'blank' };
      }
    }

    return { dataUrl: canvas.toDataURL('image/png') };
  } catch (error) {
    console.warn('[SCREENSHOT] capture failed', error);
    return { dataUrl: null, reason: 'error' };
  }
}

function waitForIdle(map: mapboxgl.Map, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve) => {
    if (map.isStyleLoaded() && !map.isMoving()) {
      // Still yield a frame so the last setData lands in the buffer.
      requestAnimationFrame(() => resolve());
      return;
    }
    const done = () => {
      clearTimeout(timer);
      map.off('idle', done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    map.once('idle', done);
  });
}
