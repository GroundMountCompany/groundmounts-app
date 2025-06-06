/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {

    return [
      {
        source: '/(.*)',         // every route
        headers: [
          
          // Optional fallback for very old browsers
          // REMOVE if you only need modern browsers
          { key: 'X-Frame-Options', value: 'ALLOW-FROM https://transcendent-empanada-380557.netlify.app https://www.groundmounts.com http://192.168.29.68:3000' },
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
