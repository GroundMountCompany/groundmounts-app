// middleware.ts (Next 13 / 14)
import { NextRequest, NextResponse } from 'next/server';

const TOKEN = 'DH6LPsTDBX14hooYi5i0K203HoK14e0J';          // the real Protection-Bypass token
const PARAMS = `x-vercel-protection-bypass=${TOKEN}&x-vercel-set-bypass-cookie=samesitenone`;

export function middleware(req: NextRequest) {
  // Skip for assets that already have the param
  if (req.nextUrl.searchParams.has('x-vercel-protection-bypass')) {
    return NextResponse.next();
  }

  // Append the params
  const url = req.nextUrl.clone();
  url.search += (url.search ? '&' : '?') + PARAMS;

  return NextResponse.rewrite(url);
}
