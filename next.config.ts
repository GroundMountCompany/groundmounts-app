/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "" // Clear or override default DENY
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://groundmounts.com http://localhost:3000 http://192.168.29.68:5500"
          }
        ]
      }
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
