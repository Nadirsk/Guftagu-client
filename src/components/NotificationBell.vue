<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { ApiError, api } from '@/lib/api'

/**
 * C.5a / general — every admin's own notification inbox, any role, no permission key.
 * `Notification` rows already get written (support escalation, for one) but nothing read
 * them back for the panel before this: no bell, no endpoint to call.
 */
interface AdminNotification {
  id: number
  type: string
  title: string
  body: string
  deep_link: string | null
  is_read: boolean
  created_at: string | null
}

const router = useRouter()

const open = ref(false)
const loading = ref(false)
const items = ref<AdminNotification[]>([])
const unreadCount = ref(0)

let timer: ReturnType<typeof setInterval> | null = null

async function load() {
  loading.value = items.value.length === 0
  try {
    const { data, meta } = await api.get<AdminNotification[]>('/admin/notifications', { per_page: 15 })
    items.value = data
    unreadCount.value = meta.unread_count ?? 0
  } catch {
    // A failed background refresh should not interrupt the panel.
  } finally {
    loading.value = false
  }
}

async function markRead(item: AdminNotification) {
  if (item.is_read) return
  item.is_read = true
  unreadCount.value = Math.max(0, unreadCount.value - 1)
  try {
    await api.post(`/admin/notifications/${item.id}/read`)
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function markAllRead() {
  if (unreadCount.value === 0) return
  const previousItems = items.value
  const previousCount = unreadCount.value
  items.value = items.value.map((n) => ({ ...n, is_read: true }))
  unreadCount.value = 0
  try {
    await api.post('/admin/notifications/read-all')
  } catch (e) {
    items.value = previousItems
    unreadCount.value = previousCount
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

function openItem(item: AdminNotification) {
  void markRead(item)
  open.value = false
  if (item.deep_link) void router.push(item.deep_link)
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

onMounted(() => {
  void load()
  // A fixed background poll, independent of which screen is open — same reasoning as
  // useCriticalAlerts, just for the general inbox rather than critical reports only.
  timer = setInterval(load, 30000)
})

onUnmounted(() => {
  if (timer !== null) clearInterval(timer)
})
</script>

<template>
  <el-popover v-model:visible="open" placement="bottom-end" width="340" trigger="click" :show-arrow="false" @show="load">
    <template #reference>
      <button
        type="button"
        class="relative flex h-7 w-7 shrink-0 items-center justify-center text-[var(--color-legend)] transition-colors hover:text-[var(--color-paper)]"
        aria-label="Notifications"
      >
        <svg viewBox="0 0 16 16" class="h-4 w-4" fill="currentColor" aria-hidden="true">
          <path
            d="M8 1a4 4 0 0 0-4 4v2.2c0 .5-.16 1-.46 1.4L2.3 10.2a1 1 0 0 0 .8 1.6h9.8a1 1 0 0 0 .8-1.6l-1.24-1.6A2.3 2.3 0 0 1 12 7.2V5a4 4 0 0 0-4-4Zm0 13.5a1.8 1.8 0 0 0 1.79-1.5H6.21A1.8 1.8 0 0 0 8 14.5Z"
          />
        </svg>
        <span
          v-if="unreadCount > 0"
          class="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[var(--color-signal)] px-1 text-[9px] font-bold leading-none text-[var(--color-ink)]"
        >
          {{ unreadCount > 9 ? '9+' : unreadCount }}
        </span>
      </button>
    </template>

    <div class="flex items-center justify-between border-b border-[var(--color-edge)] px-3 py-2">
      <div class="eyebrow">Notifications</div>
      <button
        v-if="unreadCount > 0"
        type="button"
        class="text-[11px] text-[var(--color-legend)] hover:text-[var(--color-paper)]"
        @click="markAllRead"
      >
        Mark all read
      </button>
    </div>

    <div class="max-h-80 overflow-y-auto">
      <div v-if="loading" class="px-3 py-6 text-center text-[12px] text-[var(--color-legend)]">Loading…</div>
      <div v-else-if="!items.length" class="px-3 py-6 text-center text-[12px] text-[var(--color-legend)]">
        Nothing yet.
      </div>
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="block w-full border-b border-[var(--color-edge)] px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-[var(--color-raised)]"
        @click="openItem(item)"
      >
        <div class="flex items-start gap-2">
          <span
            class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
            :class="item.is_read ? 'bg-transparent' : 'bg-[var(--color-signal)]'"
          />
          <div class="min-w-0 flex-1">
            <div class="truncate text-[13px]" :class="item.is_read ? 'text-[var(--color-legend)]' : 'font-medium'">
              {{ item.title }}
            </div>
            <div class="truncate text-[12px] text-[var(--color-legend)]">{{ item.body }}</div>
            <div class="key mt-0.5 text-[var(--color-legend-dim)]">{{ timeAgo(item.created_at) }}</div>
          </div>
        </div>
      </button>
    </div>
  </el-popover>
</template>
