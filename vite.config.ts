import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

// `loadEnv` rather than `process.env`: Vite only injects VITE_-prefixed variables into the
// client bundle, and none of them exist on `process.env` here at all. The third argument is
// the prefix filter — left at 'VITE_' so a stray secret in .env cannot leak into the config
// by being read here and inlined somewhere.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
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
      port: Number(env.VITE_DEV_PORT) || 5173,
      strictPort: true,
      // The API is served by `php artisan serve` on 8001 — 8000 belongs to the old FastAPI
      // app. Proxying keeps the browser on one origin, so there is no CORS setup in dev and
      // the app can use relative URLs that also work behind one nginx vhost in production.
      //
      // The fallback is the same value `.env.example` ships, so a checkout with no `.env`
      // still runs. An env file that is only *usually* present produces the worst kind of
      // bug report: "works on my machine, and I could not tell you why".
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8001',
          changeOrigin: true,
        },
      },
    },
  }
})
