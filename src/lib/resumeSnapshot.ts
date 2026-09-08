import type { LngLat } from './geo/units';

/**
 * Where a snapshot lives in Redis.
 *
 * Here rather than in the route that reads it: a Next route module may only
 * export its handlers, so a shared constant declared there fails the build
 * with an error about route types that says nothing about the real cause.
 */
export const RESUME_PREFIX = 'gm:resume:';

/**
 * The design, without the person.
 *
 * An explicit allow-list, not an omit-list. The store gains fields every
 * phase, and a snapshot built by subtraction would silently start carrying the
 * next PII field somebody adds. Everything here is a fact about a parcel and a
 * design; the name, email, phone and street address are not in it and cannot
 * become part of it by accident.
 *
 * The address line itself is deliberately absent even though the coordinates
 * are here: coordinates restore the map, and a resumed funnel re-geocodes to
 * a label rather than carrying one around in a store somebody may share.
 */
export interface ResumeSnapshot {
  version: 1;
  step: number;
  coordinates: { latitude: number; longitude: number };
  electricalMeterPosition: LngLat | null;
  arrayCenter: LngLat | null;
  azimuth: number;
  totalPanels: number;
  panelAdjust: number;
  sizingMode: 'auto' | 'manual';
  trenchFeet: number;
  avgValue: number;
  rateCentsPerKwh: number;
  percentage: number;
  billAnnualKwh: number | null;
  panelTier: 'standard' | 'premium';
  slopeAnswer: 'flat' | 'slight' | 'big';
  rocky: boolean;
  needsClearing: boolean;
  batteryInterest: boolean;
  savedAt: number;
}

const NUMERIC_KEYS = [
  'azimuth',
  'totalPanels',
  'panelAdjust',
  'trenchFeet',
  'avgValue',
  'rateCentsPerKwh',
  'percentage',
] as const;

function finiteOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function lngLat(value: unknown): LngLat | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [lng, lat] = value;
  if (!Number.isFinite(Number(lng)) || !Number.isFinite(Number(lat))) return null;
  if (Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180) return null;
  return [Number(lng), Number(lat)];
}

/**
 * Re-read a snapshot that arrived over the network.
 *
 * Written by the browser, so it is not trusted on the way in even though it is
 * ours: a snapshot is stored for thirty days and handed back to a different
 * device, and anything it carries ends up in a live store. Returns null rather
 * than a partly-filled object, because half a design is worse than none.
 */
export function parseSnapshot(value: unknown): ResumeSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) return null;

  const coords = raw.coordinates as { latitude?: unknown; longitude?: unknown } | undefined;
  const latitude = finiteOr(coords?.latitude, 0);
  const longitude = finiteOr(coords?.longitude, 0);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  const step = finiteOr(raw.step, 0);
  if (step < 0 || step > 5) return null;

  const numbers = Object.fromEntries(
    NUMERIC_KEYS.map((key) => [key, finiteOr(raw[key], 0)])
  ) as Record<(typeof NUMERIC_KEYS)[number], number>;

  return {
    version: 1,
    step: Math.round(step),
    coordinates: { latitude, longitude },
    electricalMeterPosition: lngLat(raw.electricalMeterPosition),
    arrayCenter: lngLat(raw.arrayCenter),
    ...numbers,
    sizingMode: raw.sizingMode === 'manual' ? 'manual' : 'auto',
    billAnnualKwh: Number.isFinite(Number(raw.billAnnualKwh)) ? Number(raw.billAnnualKwh) : null,
    panelTier: raw.panelTier === 'premium' ? 'premium' : 'standard',
    slopeAnswer:
      raw.slopeAnswer === 'slight' || raw.slopeAnswer === 'big' ? raw.slopeAnswer : 'flat',
    rocky: raw.rocky === true,
    needsClearing: raw.needsClearing === true,
    batteryInterest: raw.batteryInterest === true,
    savedAt: finiteOr(raw.savedAt, 0),
  };
}
