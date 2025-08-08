// next.config.mjs
import bundleAnalyzer from "@next/bundle-analyzer";

const withAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default withAnalyzer({
  experimental: {
    // helps tree-shake framer-motion submodules
    optimizePackageImports: ["framer-motion"],
  },
});