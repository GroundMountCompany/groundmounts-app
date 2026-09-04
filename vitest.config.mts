import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // tsconfig leaves JSX alone for Next to compile ("jsx": "preserve"), which
  // the test runner would otherwise inherit and choke on. Route tests render
  // the email template to HTML, so JSX has to compile here.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Playwright specs live in e2e/ and are driven by `npm run test:e2e`.
    exclude: ['node_modules', '.next', 'e2e'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
});
