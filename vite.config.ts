import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // strictPort, not because the port matters, but because Vite's default behaviour is
    // to move to the next free one — which leaves a stale tab pointed at a dead port and
    // a "connection refused" that looks like an API failure. Failing loudly is kinder.
    port: 5173,
    strictPort: true,
    // The API is served by `php artisan serve` on 8001 — 8000 belongs to the old FastAPI
    // app. Proxying keeps the browser on one origin, so there is no CORS setup in dev and
    // the app can use relative URLs that also work behind one nginx vhost in production.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
    },
  },
})
