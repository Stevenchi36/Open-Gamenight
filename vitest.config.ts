import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['{apps,packages,games}/*/test/**/*.test.ts'],
    environment: 'node',
    // The leak tests are synchronous loops (bounded by maxSteps) that a timeout can't interrupt,
    // so a timeout only fails a slow pass. GitHub's runners ran the suite in 77-279 s against
    // 28 s locally, so CI gets far more room than a fixed per-test number allows.
    testTimeout: process.env.CI ? 180_000 : 30_000,
  },
})
