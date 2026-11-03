import { defineConfig } from 'vitest/config';

/**
 * Root-level tests that live outside the workspaces: the /api functions and the demo seed.
 * Not named vitest.config.ts on purpose: workspaces would find it by searching upwards.
 * (apps/web and packages/shared run their own `vitest run`.) Playwright specs are excluded.
 */
export default defineConfig({
  test: {
    include: ['api/**/*.test.ts', 'scripts/demo/**/*.test.ts'],
  },
});
