import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test' },
    hookTimeout: 120000,
    testTimeout: 20000,
  },
})
