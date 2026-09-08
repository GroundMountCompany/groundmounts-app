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
  /**
   * Declared so it is always inlined as a literal, even when it is unset.
   *
   * The e2e test hooks (`__gmTest` and friends) are behind
   * `process.env.NEXT_PUBLIC_E2E_HOOKS === '1'`. Next only substitutes a
   * NEXT_PUBLIC_ variable it can see at build time — an unset one is left as a
   * runtime lookup, which the minifier cannot fold, and the hook shipped.
   * Naming it here means an unset flag compiles to `"" === "1"` and the whole
   * branch is dropped. `npm run verify:hooks` checks the built output.
   */
  env: {
    NEXT_PUBLIC_E2E_HOOKS: process.env.NEXT_PUBLIC_E2E_HOOKS ?? "",
    /**
     * Same reason as above: declared so an unset flag inlines as a literal.
     *
     * Left unset, `?demo=` does nothing and the seed is dropped from the
     * bundle. The owner sets it on Preview only.
     */
    NEXT_PUBLIC_DEMO_PARAMS: process.env.NEXT_PUBLIC_DEMO_PARAMS ?? "",
    /**
     * Analytics, for the same reason again.
     *
     * A blank key has to compile to a blank literal so `analyticsEnabled()`
     * folds to false and the `import('posthog-js')` behind it never runs.
     * Without this an unset key is a runtime lookup the minifier cannot fold,
     * so the import executes and a deployment with no analytics configured
     * still downloads and boots the analytics library.
     *
     * The library's chunk is still *emitted* either way — a dynamic import is
     * a code split, not a conditional compile. What this buys is that a blank
     * key never fetches it: ~280KB the customer does not pay for, and no init,
     * no session recorder, no requests. The e2e asserts exactly that.
     */
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "",
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "",
  },
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
