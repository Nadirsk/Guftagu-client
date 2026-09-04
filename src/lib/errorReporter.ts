import type { App } from 'vue'

import { http, tokenStore } from '@/lib/api'

/**
 * IT Admin epic — every uncaught error in this app gets POSTed to
 * `/admin/system/logs/frontend` so it shows up next to the Laravel log. Failures reporting
 * a failure would be its own bug, so this never throws and never retries.
 *
 * Capped per page load: a render loop that errors every frame should not turn into a
 * flood of requests on top of whatever is already broken.
 */
const MAX_REPORTS_PER_LOAD = 20
let sent = 0

function report(message: string, stack?: string | null) {
  // Pre-login errors (the login screen itself breaking) have nobody to attribute them to
  // server-side and the endpoint requires auth anyway, so there is nothing useful to do.
  if (!tokenStore.get()) return
  if (sent >= MAX_REPORTS_PER_LOAD) return
  sent++

  http
    .post('/admin/system/logs/frontend', {
      level: 'error',
      message: message.slice(0, 2000),
      stack: stack ? stack.slice(0, 8000) : undefined,
      source_url: window.location.pathname + window.location.search,
    })
    .catch(() => {
      /* the log pipeline is not itself allowed to become a source of errors */
    })
}

export function installErrorReporter(app: App) {
  app.config.errorHandler = (err, _instance, info) => {
    const error = err instanceof Error ? err : new Error(String(err))
    report(`[Vue] ${error.message} (${info})`, error.stack)
    // eslint-disable-next-line no-console
    console.error(err)
  }

  window.addEventListener('error', (event) => {
    report(event.message, event.error?.stack)
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    report(`[unhandled rejection] ${message}`, stack)
  })
}
