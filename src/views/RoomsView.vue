<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import type { LiveRooms, RoomCategoryRow, RoomRow, RoomStatus } from '@/types/api'

/** GFT-043 — the live-rooms grid. */
const router = useRouter()

const rooms = ref<RoomRow[]>([])
const categories = ref<RoomCategoryRow[]>([])
const realtime = ref<LiveRooms['realtime'] | null>(null)
const totals = ref({ rooms: 0, listeners: 0 })

const loading = ref(true)
const mode = ref<'live' | 'all'>('live')
const category = ref<number | ''>('')
const statusFilter = ref<'' | RoomStatus>('')
const search = ref('')

let ticker: number | undefined

onMounted(async () => {
  try {
    const { data } = await api.get<RoomCategoryRow[]>('/admin/room-categories')
    categories.value = data
  } catch {
    /* the filter simply has no options */
  }

  await load()
  loading.value = false

  // A.4a asks for counts current within 10 seconds without a reload.
  ticker = window.setInterval(() => void load(true), 10_000)
})

onUnmounted(() => window.clearInterval(ticker))

/** B.3c — feature a set of rooms for one window, all or nothing. */
const selected = ref<number[]>([])
const promoting = ref(false)

/** A card grid has no selection column, so each card carries its own toggle. */
function toggleSelected(id: number) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((existing) => existing !== id)
    : [...selected.value, id]
}

async function featureBulk() {
  if (selected.value.length === 0) return

  const days = window.prompt('Feature them for how many days?', '7')
  if (days === null) return

  const until = new Date()
  until.setDate(until.getDate() + Math.max(1, Number(days) || 7))

  promoting.value = true
  try {
    const { data } = await api.post<{ featured: number; note: string }>('/admin/rooms/feature-bulk', {
      room_ids: selected.value,
      until: until.toISOString(),
    })
    ElMessage.success(`${data.featured} rooms featured`)
    ElMessage.info(data.note)
    selected.value = []
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    promoting.value = false
  }
}

async function load(quiet = false) {
  try {
    if (mode.value === 'live') {
      const { data } = await api.get<LiveRooms>('/admin/rooms/live', {
        category: category.value || undefined,
      })
      rooms.value = data.rooms
      realtime.value = data.realtime
      totals.value = { rooms: data.total, listeners: data.listeners }
    } else {
      const { data, meta } = await api.get<RoomRow[]>('/admin/rooms', {
        category: category.value || undefined,
        status: statusFilter.value || undefined,
        q: search.value || undefined,
        per_page: 48,
      })
      rooms.value = data
      realtime.value = null
      totals.value = {
        rooms: meta.total ?? data.length,
        listeners: data.reduce((sum, room) => sum + room.listener_count, 0),
      }
    }
  } catch (e) {
    if (!quiet && e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function switchMode(next: 'live' | 'all') {
  mode.value = next
  await load()
}

function open(room: RoomRow) {
  void router.push({ name: 'room-detail', params: { id: room.id } })
}

async function toggleFeature(room: RoomRow) {
  if (room.is_featured) {
    try {
      await api.post(`/admin/rooms/${room.id}/feature`, { featured: false })
      ElMessage.success('No longer featured')
      await load()
    } catch (e) {
      if (e instanceof ApiError) ElMessage.error(e.message)
    }
    return
  }

  let hours: string
  try {
    const result = await ElMessageBox.prompt(
      'For how many hours? Leave blank to feature it until you turn it off.',
      `Feature “${room.name}”`,
      {
        confirmButtonText: 'Feature',
        cancelButtonText: 'Cancel',
        inputPlaceholder: 'e.g. 24',
        inputValue: '24',
      },
    )
    hours = result.value
  } catch {
    return
  }

  const until =
    hours && Number(hours) > 0
      ? new Date(Date.now() + Number(hours) * 3_600_000).toISOString()
      : undefined

  try {
    await api.post(`/admin/rooms/${room.id}/feature`, { featured: true, until })
    ElMessage.success(until ? `Featured for ${hours} hours` : 'Featured')
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function forceClose(room: RoomRow) {
  let reason: string
  try {
    const result = await ElMessageBox.prompt(
      `Everyone in “${room.name}” is turned out and the room cannot reopen. This is recorded against your name in both the audit and moderation logs.`,
      'Force-close this room',
      {
        confirmButtonText: 'Force-close',
        cancelButtonText: 'Cancel',
        inputType: 'textarea',
        inputPlaceholder: 'Why is this room being closed?',
        inputValidator: (value) => (value && value.trim().length >= 3) || 'A reason is required',
      },
    )
    reason = result.value
  } catch {
    return
  }

  try {
    const { message } = await api.post(`/admin/rooms/${room.id}/close`, { reason })
    ElMessage.success(message)
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

const statusTone: Record<RoomStatus, '' | 'success' | 'warning' | 'danger' | 'info'> = {
  live: 'success',
  idle: 'info',
  closed: 'info',
  force_closed: 'danger',
}

function format(value: number): string {
  return value.toLocaleString()
}

function elapsed(iso: string | null): string {
  if (!iso) return '—'
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

const featureWindow = computed(
  () => (room: RoomRow) =>
    room.featured_until
      ? `until ${new Date(room.featured_until).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
      : 'no end set',
)
</script>

<template>
  <PageHead
    eyebrow="Platform"
    :title="mode === 'live' ? 'Live rooms' : 'All rooms'"
    :lede="
      mode === 'live'
        ? `${format(totals.rooms)} live · ${format(totals.listeners)} listeners. Refreshes every 10 seconds.`
        : `${format(totals.rooms)} rooms.`
    "
  >
    <template #actions>
      <el-button
        v-if="selected.length"
        v-permission="'rooms.feature'"
        size="small"
        type="primary"
        :loading="promoting"
        @click="featureBulk"
      >
        Feature {{ selected.length }} rooms
      </el-button>
      <el-radio-group :model-value="mode" size="small" @update:model-value="switchMode($event as 'live' | 'all')">
        <el-radio-button value="live">Live</el-radio-button>
        <el-radio-button value="all">All</el-radio-button>
      </el-radio-group>
    </template>
  </PageHead>

  <div class="px-5 py-5 md:px-7">
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <el-input
        v-if="mode === 'all'"
        v-model="search"
        placeholder="Room name or code"
        clearable
        class="w-full sm:w-56"
        @change="load()"
      />
      <el-select v-model="category" placeholder="Any category" clearable class="w-44" @change="load()">
        <el-option v-for="c in categories" :key="c.id" :label="c.name_en" :value="c.id" />
      </el-select>
      <el-select
        v-if="mode === 'all'"
        v-model="statusFilter"
        placeholder="Any status"
        clearable
        class="w-40"
        @change="load()"
      >
        <el-option label="Live" value="live" />
        <el-option label="Idle" value="idle" />
        <el-option label="Force-closed" value="force_closed" />
      </el-select>
    </div>

    <!-- Honest about what the listener numbers actually are. -->
    <p
      v-if="realtime && !realtime.available"
      class="panel mb-4 border-l-2 border-l-[var(--color-signal)] px-3 py-2 text-[12px]"
    >
      {{ realtime.note }}
    </p>

    <div v-loading="loading">
      <EmptyState
        v-if="!loading && rooms.length === 0"
        :title="mode === 'live' ? 'Nothing is live right now' : 'No rooms match that'"
        :body="
          mode === 'live'
            ? 'Rooms appear here the moment a host opens one. Switch to All to see idle and closed rooms.'
            : 'Clear the filters to see everything.'
        "
      />

      <div v-else class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <article
          v-for="room in rooms"
          :key="room.id"
          class="panel relative flex flex-col transition-colors hover:border-[var(--color-edge-bright)]"
          :class="selected.includes(room.id) ? 'border-[var(--color-signal)]' : ''"
        >
          <el-checkbox
            v-permission="'rooms.feature'"
            :model-value="selected.includes(room.id)"
            class="absolute top-2 right-2 z-10"
            @change="toggleSelected(room.id)"
            @click.stop
          />

          <button type="button" class="flex-1 px-4 pt-3 pb-2 text-left" @click="open(room)">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="truncate text-[14px] font-semibold">{{ room.name }}</div>
                <div class="key mt-0.5 text-[var(--color-legend)]">
                  {{ room.room_code }} · {{ room.category?.name ?? 'uncategorised' }}
                </div>
              </div>
              <el-tag :type="statusTone[room.status]" size="small">{{ room.status }}</el-tag>
            </div>

            <div class="mt-3 flex items-end justify-between">
              <div>
                <div class="eyebrow">Listeners</div>
                <div class="key text-[18px] leading-none">{{ format(room.listener_count) }}</div>
              </div>
              <div class="text-right">
                <div class="eyebrow">Seats</div>
                <div class="key text-[14px]">{{ room.seat_count }}</div>
              </div>
              <div class="text-right">
                <div class="eyebrow">On air</div>
                <div class="key text-[14px]">{{ elapsed(room.started_at) }}</div>
              </div>
            </div>

            <div class="mt-2 flex flex-wrap gap-1.5">
              <el-tag v-if="room.is_pinned" size="small">pinned</el-tag>
              <el-tag v-if="room.is_featured" type="warning" size="small">
                featured · {{ featureWindow(room) }}
              </el-tag>
              <!-- The window lapsed but the column is still set; say which is true. -->
              <el-tag v-else-if="room.featured_flag" size="small" type="info">
                feature window ended
              </el-tag>
              <el-tag v-if="room.visibility === 'private'" size="small" type="info">private</el-tag>
            </div>
          </button>

          <div class="flex gap-2 border-t border-[var(--color-edge)] px-4 py-2">
            <el-button v-permission="'rooms.feature'" size="small" @click="toggleFeature(room)">
              {{ room.is_featured ? 'Unfeature' : 'Feature' }}
            </el-button>
            <el-button
              v-if="room.status === 'live' || room.status === 'idle'"
              v-permission="'rooms.force_close'"
              size="small"
              type="danger"
              plain
              @click="forceClose(room)"
            >
              Force-close
            </el-button>
            <el-button class="ml-auto" size="small" text @click="open(room)">Open</el-button>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>
