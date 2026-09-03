import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    // ESLint 9 flat config ignores .eslintignore entirely; build output has to
    // be excluded here or `next lint` walks it.
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "coverage/**",
      "playwright-report/**",
      "blob-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Copy lives in src/config/copy.ts and nowhere else. Any bare string in
    // JSX fails the build, which is what stops marketing language reappearing
    // one hard-coded label at a time — the voice test can only police strings
    // it can see.
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
    ignores: [
      // The quote email body, not funnel UI. It gets the same treatment when
      // Phase 7 makes the emails brand-matched; doing it here would mean
      // rewriting a template that is about to change anyway.
      "src/components/common/EmailTemplate.tsx",
      // Inline analytics scripts, which are code rather than copy.
      "src/app/layout.tsx",
    ],
    rules: {
      "react/jsx-no-literals": [
        "error",
        {
          noStrings: true,
          ignoreProps: true,
          allowedStrings: [
            // Symbols and punctuation carry no voice.
            "$", "%", "·", "—", "–", "&minus;", "+", "−", "/", ":", ".", ",",
            "(", ")", "x", "°", "kW", "ft", "kWh", "kWh/yr",
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
