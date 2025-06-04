/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {

    return [
      {
        source: '/(.*)',         // every route
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "frame-ancestors",
              "'self'",
              "http://localhost:3000",
              "https://www.groundmounts.com",
              "https://transcendent-empanada-380557.netlify.app",
            ].join(' '),
          },
          // Optional fallback for very old browsers
          // REMOVE if you only need modern browsers
          { key: 'X-Frame-Options', value: 'ALLOW-FROM https://transcendent-empanada-380557.netlify.app https://www.groundmounts.com' },
        ],
      },
    ];
  },
  reactStrictMode: true,
  eslint: {
    // only run ESLint during `next dev`, skip it on `next build`
    ignoreDuringBuilds: true,
  },
  env: {
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  },
};

export default nextConfig;
