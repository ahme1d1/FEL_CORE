import { defineConfig } from 'vitest/config';

/**
 * `.mts`, not `.ts`: the package root has no `"type"` field — `dist/rules` must stay CommonJS
 * for FEL_API — so a `.ts` config is loaded as CommonJS and its ESM syntax warns today and
 * fails in a future Vite.
 *
 * The package's first vitest config — it ran on defaults while `src/rules` was the only half.
 *
 * `setupFiles` installs a hand-rolled tracking adapter, never Vue. The client half's suites MUST
 * pass with no framework present: that is the extraction's whole claim, and a suite that quietly
 * depended on Vue would prove the opposite of what it looks like it proves.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/setup.ts'],
  },
});
