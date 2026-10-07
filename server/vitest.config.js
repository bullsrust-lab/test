import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test' },
    // one in-memory replica set for the whole run (transactions need a replica set),
    // every test file gets its own database on it
    globalSetup: './tests/globalSetup.js',
    hookTimeout: 120000,
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      // the brief measures "new server code" in these three folders
      include: ['controllers/**', 'models/**', 'migrations/**'],
      reporter: ['text', 'text-summary'],
      thresholds: { lines: 65, statements: 65, functions: 65, branches: 65 },
    },
  },
})
