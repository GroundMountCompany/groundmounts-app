/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {

    return [
      {
        source: '/(.*)',         // every route
        headers: [
            {
              "key": "Content-Security-Policy",
              "value": "frame-ancestors 'self' " + process.env.WHILELIST_DOMAINS
            }
          ]
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
