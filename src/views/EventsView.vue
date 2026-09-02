<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import type { EventPhase, EventRow, EventType } from '@/types/api'

/** GFT-099 — the event list and builder. */
const router = useRouter()

const rows = ref<EventRow[]>([])
const loading = ref(true)
const total = ref(0)
const phase = ref<'' | EventPhase>('')
const type = ref<'' | EventType>('')

const dialog = ref(false)
const saving = ref(false)
const errors = ref<Record<string, string>>({})

const form = reactive({
  type: 'event' as EventType,
  title_en: '',
  title_hi: '',
  description: '',
  entry_type: 'free',
  entry_cost: 0,
  starts_at: '',
  ends_at: '',
  max_participants: null as number | null,
  winner_count: 3,
  algorithm: 'random',
})

onMounted(async () => {
  await load()
  loading.value = false
})

async function load() {
  try {
    const { data, meta } = await api.get<EventRow[]>('/admin/events', {
      phase: phase.value || undefined,
      type: type.value || undefined,
      per_page: 50,
    })
    rows.value = data
    total.value = meta.total ?? data.length
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

function create() {
  const start = new Date(Date.now() + 86_400_000)
  const end = new Date(Date.now() + 3 * 86_400_000)

  Object.assign(form, {
    type: 'event', title_en: '', title_hi: '', description: '',
    entry_type: 'free', entry_cost: 0,
    starts_at: start.toISOString().slice(0, 19),
    ends_at: end.toISOString().slice(0, 19),
    max_participants: null, winner_count: 3, algorithm: 'random',
  })
  errors.value = {}
  dialog.value = true
}

async function save() {
  saving.value = true
  errors.value = {}

  const body: Record<string, unknown> = {
    type: form.type,
    title_en: form.title_en,
    title_hi: form.title_hi || null,
    description: form.description || null,
    entry_type: form.entry_type,
    entry_cost: form.entry_type === 'coins' ? form.entry_cost : 0,
    starts_at: form.starts_at,
    ends_at: form.ends_at,
    max_participants: form.max_participants,
  }

  if (form.type === 'lucky_draw') {
    body.winner_count = form.winner_count
    body.algorithm = form.algorithm
  }

  try {
    await api.post('/admin/events', body)
    ElMessage.success('Created as a draft — publish it when the details are right')
    dialog.value = false
    await load()
  } catch (e) {
    if (e instanceof ApiError) {
      errors.value = e.fieldErrors
      if (!Object.keys(errors.value).length) ElMessage.error(e.message)
    }
  } finally {
    saving.value = false
  }
}

async function publish(row: EventRow) {
  try {
    await ElMessageBox.confirm(
      'Once published, the event goes live and ends on its own schedule — nobody has to flip a switch at 20:00.',
      `Publish “${row.title_en}”?`,
      { confirmButtonText: 'Publish', cancelButtonText: 'Cancel' },
    )
  } catch {
    return
  }

  try {
    const { message } = await api.post(`/admin/events/${row.id}/publish`)
    ElMessage.success(message)
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function cancel(row: EventRow) {
  let reason: string
  try {
    const result = await ElMessageBox.prompt('Why is this being cancelled?', `Cancel “${row.title_en}”`, {
      confirmButtonText: 'Cancel event',
      cancelButtonText: 'Keep it',
      inputType: 'textarea',
      inputValidator: (value) => (value && value.trim().length >= 3) || 'A reason is required',
    })
    reason = result.value
  } catch {
    return
  }

  try {
    await api.post(`/admin/events/${row.id}/cancel`, { reason })
    ElMessage.success('Event cancelled')
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

function open(row: EventRow) {
  void router.push({ name: 'event-detail', params: { id: row.id } })
}

const phaseTone: Record<EventPhase, '' | 'success' | 'warning' | 'danger' | 'info'> = {
  live: 'success',
  upcoming: 'warning',
  ended: 'info',
  draft: '',
  cancelled: 'danger',
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}
</script>

<template>
  <PageHead
    eyebrow="Engagement"
    title="Events"
    :lede="`${total} events. A published event goes live and ends on its own — the phase comes from the clock, not from anyone remembering to change it.`"
  >
    <template #actions>
      <el-select v-model="type" placeholder="Any type" clearable size="small" class="w-36" @change="load">
        <el-option label="Event" value="event" />
        <el-option label="Tournament" value="tournament" />
        <el-option label="Lucky draw" value="lucky_draw" />
      </el-select>
      <el-select v-model="phase" placeholder="Any phase" clearable size="small" class="w-36" @change="load">
        <el-option label="Live" value="live" />
        <el-option label="Upcoming" value="upcoming" />
        <el-option label="Ended" value="ended" />
        <el-option label="Draft" value="draft" />
        <el-option label="Cancelled" value="cancelled" />
      </el-select>
      <el-button v-permission="'events.manage'" type="primary" size="small" @click="create">
        New event
      </el-button>
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <EmptyState
      v-if="!loading && rows.length === 0"
      title="No events match that"
      body="Create one — it starts as a draft, so nothing goes live until you publish it."
    />

    <div v-else class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <article v-for="row in rows" :key="row.id" class="panel flex flex-col">
        <button type="button" class="flex-1 px-4 pt-3 pb-2 text-left" @click="open(row)">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="truncate text-[14px] font-semibold">{{ row.title_en }}</div>
              <div class="eyebrow mt-0.5">{{ row.type.replace('_', ' ') }}</div>
            </div>
            <el-tag :type="phaseTone[row.phase]" size="small">{{ row.phase }}</el-tag>
          </div>

          <div class="mt-3 space-y-0.5">
            <div class="key text-[12px] text-[var(--color-legend)]">
              {{ when(row.starts_at) }} → {{ when(row.ends_at) }}
            </div>
            <div class="key text-[12px] text-[var(--color-legend)]">
              {{ row.participant_count }} entrants
              <template v-if="row.max_participants"> of {{ row.max_participants }}</template>
            </div>
          </div>

          <div class="mt-2 flex flex-wrap gap-1.5">
            <el-tag v-if="row.is_featured" type="warning" size="small">featured</el-tag>
            <el-tag v-if="row.entry_type !== 'free'" size="small" type="info">
              {{ row.entry_type === 'coins' ? `${row.entry_cost} coins` : row.entry_type }}
            </el-tag>
          </div>
        </button>

        <div class="flex gap-2 border-t border-[var(--color-edge)] px-4 py-2">
          <el-button
            v-if="row.status === 'draft'"
            v-permission="'events.manage'"
            size="small"
            type="primary"
            @click="publish(row)"
          >
            Publish
          </el-button>
          <el-button
            v-if="row.status === 'scheduled' && row.phase !== 'ended'"
            v-permission="'events.manage'"
            size="small"
            type="danger"
            plain
            @click="cancel(row)"
          >
            Cancel
          </el-button>
          <el-button class="ml-auto" size="small" text @click="open(row)">Open</el-button>
        </div>
      </article>
    </div>
  </div>

  <el-dialog v-model="dialog" title="New event" width="500">
    <div class="space-y-3">
      <div>
        <label class="eyebrow mb-1 block">Type</label>
        <el-radio-group v-model="form.type" size="small">
          <el-radio-button value="event">Event</el-radio-button>
          <el-radio-button value="tournament">Tournament</el-radio-button>
          <el-radio-button value="lucky_draw">Lucky draw</el-radio-button>
        </el-radio-group>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="eyebrow mb-1 block" for="e-en">Title (English)</label>
          <el-input id="e-en" v-model="form.title_en" />
          <p v-if="errors.title_en" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ errors.title_en }}</p>
        </div>
        <div>
          <label class="eyebrow mb-1 block" for="e-hi">Title (Hindi)</label>
          <el-input id="e-hi" v-model="form.title_hi" />
        </div>
      </div>

      <div>
        <label class="eyebrow mb-1 block" for="e-desc">Description</label>
        <el-input id="e-desc" v-model="form.description" type="textarea" :rows="2" />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="eyebrow mb-1 block">Starts</label>
          <el-date-picker
            v-model="form.starts_at"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            class="w-full"
          />
        </div>
        <div>
          <label class="eyebrow mb-1 block">Ends</label>
          <el-date-picker
            v-model="form.ends_at"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            class="w-full"
          />
          <p v-if="errors.ends_at" class="mt-1 text-[12px] text-[var(--color-cut)]">{{ errors.ends_at }}</p>
        </div>
      </div>
      <p class="eyebrow">
        it flips to live and to ended at these times by itself — no scheduled job to miss
      </p>

      <div class="grid grid-cols-2 gap-3 border-t border-[var(--color-edge)] pt-3">
        <div>
          <label class="eyebrow mb-1 block">Entry</label>
          <el-select v-model="form.entry_type" class="w-full">
            <el-option label="Free" value="free" />
            <el-option label="Costs coins" value="coins" />
            <el-option label="Invite only" value="invite" />
          </el-select>
        </div>
        <div v-if="form.entry_type === 'coins'">
          <label class="eyebrow mb-1 block">Entry cost</label>
          <el-input-number v-model="form.entry_cost" :min="0" :step="100" class="w-full" />
        </div>
        <div v-else>
          <label class="eyebrow mb-1 block">Max entrants</label>
          <el-input-number v-model="form.max_participants" :min="1" class="w-full" />
        </div>
      </div>

      <div v-if="form.type === 'lucky_draw'" class="border-t border-[var(--color-edge)] pt-3">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="eyebrow mb-1 block">Winners</label>
            <el-input-number v-model="form.winner_count" :min="1" class="w-full" />
          </div>
          <div>
            <label class="eyebrow mb-1 block">Algorithm</label>
            <el-select v-model="form.algorithm" class="w-full">
              <el-option label="Random" value="random" />
              <el-option label="Weighted" value="weighted" />
            </el-select>
          </div>
        </div>
        <p class="eyebrow mt-2 leading-relaxed">
          a seed is committed the moment this is created and only its hash is published —
          the seed itself appears after the draw, so anyone can check the result
        </p>
      </div>
    </div>

    <template #footer>
      <el-button @click="dialog = false">Cancel</el-button>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="!form.title_en || !form.starts_at || !form.ends_at"
        @click="save"
      >
        Create draft
      </el-button>
    </template>
  </el-dialog>
</template>
