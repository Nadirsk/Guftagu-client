/// <reference types="vite/client" />

/**
 * The environment this app reads. Declared so `import.meta.env.VITE_FOO` is a type error
 * when `VITE_FOO` is not a real variable — without this, a typo compiles to `undefined` and
 * the fallback silently wins, which is the hardest kind of config bug to see.
 *
 * Every entry is optional: each read site has a fallback, and a checkout with no `.env`
 * must still run. See `.env.example` for what they mean.
 */
interface ImportMetaEnv {
  /** Where the app sends requests. Relative unless the API is on another origin. */
  readonly VITE_API_BASE_URL?: string
  /** Dev-server proxy target. Only read in the browser to name the right process in an error. */
  readonly VITE_API_PROXY_TARGET?: string
  /** Dev-server port. Read by vite.config.ts, not by the app. */
  readonly VITE_DEV_PORT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
