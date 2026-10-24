import { defineConfig } from '@playwright/test';

/**
 * Screenshot harness for the panel redesign (docs/redesign/PLAN.md, phases 0 and 5).
 *
 * Deliberately separate from the e2e config: it is not a test suite, it never runs in CI, and
 * it builds the app against a FAKE Supabase host that the spec intercepts — so it can capture
 * logged-in pages without credentials and without touching the real database.
 *
 *   SHOT_DIR=before npx playwright test -c scripts/redesign/playwright.config.ts
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 600_000,
  use: {
    baseURL: 'http://localhost:4174',
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command:
      'VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=mock-anon-key ' +
      'npm run build -w @piscinas/web && npm run preview -w @piscinas/web -- --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
