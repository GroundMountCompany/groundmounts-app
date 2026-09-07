import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, rateLimitOkAsync } from '@/lib/guard';
import { lookupSite } from '@/lib/server/siteLookup';

export type { SiteResponse } from '@/lib/server/siteLookup';

export async function GET(req: NextRequest) {
  if (!(await rateLimitOkAsync(getClientIp(req), 'site'))) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  // Read as strings first: Number(null) is 0, so a request with no coordinates
  // at all used to be answered with data for the Gulf of Guinea.
  const rawLat = req.nextUrl.searchParams.get('lat');
  const rawLng = req.nextUrl.searchParams.get('lng');
  const lat = Number(rawLat);
  const lng = Number(rawLng);

  if (
    rawLat === null ||
    rawLng === null ||
    rawLat.trim() === '' ||
    rawLng.trim() === '' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return NextResponse.json({ ok: false, error: 'bad_coordinates' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...(await lookupSite(lat, lng)) });
}
