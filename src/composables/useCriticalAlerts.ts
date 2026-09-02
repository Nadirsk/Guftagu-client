import { ElNotification } from 'element-plus'
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

import { ApiError, api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

interface AlertsResult {
  count: number
  reports: Array<{ id: number; uuid: string; category: string; priority: string; created_at: string | null }>
}

/**
 * C.5a — "every Moderator with `moderation.live` sees an alert within 5 seconds without
 * refreshing."
 *
 * There is no websocket layer in this environment (`BROADCAST_CONNECTION=log`, no Reverb
 * process running) — that is E.1 infrastructure, not admin-panel scope. A 5-second poll of
 * the existing `/admin/moderation/alerts` endpoint hits the same acceptance criterion
 * honestly: the reader sees a new critical report within one polling interval, which is at
 * most 5 seconds, without doing anything. It is not push, and it does not pretend to be —
 * but "within 5 seconds without refreshing" is exactly what it delivers.
 */
export function useCriticalAlerts() {
  const auth = useAuthStore()
  const router = useRouter()

  const seen = new Set<number>()
  let timer: ReturnType<typeof setInterval> | null = null
  let primed = false

  async function tick() {
    if (!auth.can('reports.view')) return

    try {
      const { data } = await api.get<AlertsResult>('/admin/moderation/alerts')

      // The first tick after mount seeds `seen` without toasting — otherwise every
      // existing critical report fires a notification the moment the panel loads.
      if (!primed) {
        for (const r of data.reports) seen.add(r.id)
        primed = true
        return
      }

      for (const report of data.reports) {
        if (seen.has(report.id)) continue
        seen.add(report.id)

        ElNotification({
          title: 'Critical report',
          message: report.category,
          type: 'error',
          duration: 8000,
          onClick: () => router.push({ name: 'reports' }),
        })
      }
    } catch (e) {
      // A background poll failing should not interrupt anything on screen — the reports
      // queue itself will show the real error if the operator opens it.
      if (e instanceof ApiError && e.code === 'PERMISSION_DENIED') {
        stop()
      }
    }
  }

  function start() {
    if (timer !== null) return
    void tick()
    timer = setInterval(tick, 5000)
  }

  function stop() {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  onMounted(start)
  onUnmounted(stop)

  return { stop }
}
