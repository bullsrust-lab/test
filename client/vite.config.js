import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // .env lives in the repo root, read PORT from there so the proxy follows the API
  const env = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), '')

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // keep the browser's Host header: the API builds invite links from it,
        // and they must point at this dev server, not at the API port
        '/api': { target: `http://localhost:${env.PORT || 5000}`, changeOrigin: false },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
    },
  }
})
