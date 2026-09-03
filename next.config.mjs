// next.config.mjs
import bundleAnalyzer from "@next/bundle-analyzer";

const withAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// The tool is embedded on brandless partner funnels, so framing stays open by
// default. Set ALLOWED_FRAME_ORIGINS to a space-separated origin list to narrow it.
const frameAncestors = process.env.ALLOWED_FRAME_ORIGINS?.trim() || "*";

export default withAnalyzer({
  reactStrictMode: true,
  experimental: {
    // helps tree-shake framer-motion submodules
    optimizePackageImports: ["framer-motion"],
  },
  eslint: {
    // Lint is wired up again (see .eslintignore) but the existing violations are
    // not yet cleared. Run `npm run lint` directly; unblock the build in Phase 2.
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${frameAncestors}`,
          },
        ],
      },
    ];
  },
});
