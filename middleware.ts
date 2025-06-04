// middleware.ts (at project root or in /src)
import { NextRequest, NextResponse } from 'next/server';

export function middleware(_req: NextRequest) {
  // ✅ Make sure we CALL next() – the () create the response object
  const res = NextResponse.next();

  // Strip the header Vercel injects on *.vercel.app
  res.headers.delete('x-frame-options');

  return res;
}

export const config = {
  matcher: '/:path*',     // run for every request
};
