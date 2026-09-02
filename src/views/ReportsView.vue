<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import type { ModerationPolicy, QueueSummary, ReportDetail, ReportRow } from '@/types/api'

/** GFT-053 — the reports queue (A.5b) and the action dialog (C.3c). */
const rows = ref<ReportRow[]>([])
const summary = ref<QueueSummary | null>(null)
const detail = ref<ReportDetail | null>(null)
const policy = ref<ModerationPolicy | null>(null)

const loading = ref(true)
const busy = ref(false)
const drawer = ref(false)

const filters = ref({ status: '', priority: '', category: '', mine: false })

const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const
const CATEGORIES = ['abuse', 'nudity', 'harassment', 'spam', 'fraud', 'underage', 'other']

/** Actions a moderator can take, and whether each one wants a duration. */
const ACTIONS = [
  { value: 'warn', label: 'Warn', timed: false, note: 'Recorded against the account. Nothing is locked.' },
  { value: 'mute', label: 'Mute', timed: true, note: 'Room-scoped. Takes effect once the realtime layer lands.' },
  { value: 'kick', label: 'Kick', timed: true, note: 'Room-scoped. Takes effect once the realtime layer lands.' },
  { value: 'ban_temp', label: 'Temporary ban', timed: true, note: 'The account releases itself when the window passes — no follow-up needed.' },
  { value: 'ban_permanent', label: 'Permanent ban', timed: false, note: 'Stays until somebody reverses it.' },
]

const form = ref({ action: 'warn', duration_minutes: 1440, note: '' })
const dialog = ref(false)

const chosenAction = computed(() => ACTIONS.find((a) => a.value === form.value.action))

onMounted(async () => {
  await Promise.all([load(), loadPolicy()])
})

watch(filters, load, { deep: true })

/**
 * C.4b — the ban ceiling, fetched up front so the duration picker can grey out what would
 * be refused rather than offering it and then failing.
 */
async function loadPolicy() {
  try {
    const { data } = await api.get<ModerationPolicy>('/admin/moderation/policy')
    policy.value = data
  } catch {
    // Without it the picker offers everything and the server still refuses correctly.
  }
}

/** C.3a — take the report so nobody else acts on it while you are deciding. */
async function claim(row: ReportRow) {
  busy.value = true
  try {
    const { data } = await api.post<{ expires_in_min: number; note: string }>(
      `/admin/reports/${row.id}/claim`,
    )
    ElMessage.success(`Claimed for ${data.expires_in_min} minutes`)
    if (detail.value) await open(row)
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

async function releaseClaim(row: ReportRow) {
  busy.value = true
  try {
    await api.del(`/admin/reports/${row.id}/claim`)
    ElMessage.success('Released')
    if (detail.value) await open(row)
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

/** Durations the caller is actually allowed to issue. */
const durationOptions = computed(() => {
  const all = [
    { label: '1 hour', value: 60 },
    { label: '24 hours', value: 1440 },
    { label: '7 days', value: 10080 },
    { label: '30 days', value: 43200 },
  ]

  const cap = policy.value?.ban.max_ban_minutes ?? null

  return cap === null ? all : all.filter((o) => o.value <= cap)
})

async function load() {
  loading.value = true
  try {
    const [q, s] = await Promise.all([
      api.get<ReportRow[]>('/admin/reports', {
        status: filters.value.status || undefined,
        priority: filters.value.priority || undefined,
        category: filters.value.category || undefined,
        mine: filters.value.mine || undefined,
        per_page: 50,
      }),
      api.get<QueueSummary>('/admin/reports/summary'),
    ])
    rows.value = q.data
    summary.value = s.data
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

async function open(row: ReportRow) {
  drawer.value = true
  detail.value = null
  try {
    const { data } = await api.get<ReportDetail>(`/admin/reports/${row.id}`)
    detail.value = data
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

function startAction() {
  form.value = { action: 'warn', duration_minutes: 1440, note: '' }
  dialog.value = true
}

async function submitAction() {
  if (!detail.value) return

  if (form.value.note.trim().length < 3) {
    ElMessage.warning('A note is required — every action has to be explicable afterwards.')
    return
  }

  busy.value = true
  try {
    await api.post(`/admin/reports/${detail.value.report.id}/action`, {
      action: form.value.action,
      duration_minutes: chosenAction.value?.timed ? form.value.duration_minutes : null,
      note: form.value.note.trim(),
    })
    ElMessage.success('Report actioned')
    dialog.value = false
    drawer.value = false
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

async function dismiss() {
  if (!detail.value) return

  const note = window.prompt('Why is this being dismissed?')
  if (note === null || note.trim().length < 3) return

  busy.value = true
  try {
    await api.post(`/admin/reports/${detail.value.report.id}/dismiss`, { note: note.trim() })
    ElMessage.success('Report dismissed')
    drawer.value = false
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

async function reverse(actionId: number) {
  const reason = window.prompt('Why is this action being reversed?')
  if (reason === null || reason.trim().length < 3) return

  busy.value = true
  try {
    await api.post(`/admin/moderation/actions/${actionId}/reverse`, { reason: reason.trim() })
    ElMessage.success('Action reversed')
    if (detail.value) await open(detail.value.report)
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

const PRIORITY_TYPE: Record<string, 'danger' | 'warning' | 'info' | ''> = {
  critical: 'danger',
  high: 'warning',
  medium: '',
  low: 'info',
}

/** "3d 4h" reads faster than 4,560 minutes when you are triaging a backlog. */
function waited(minutes: number | null): string {
  if (minutes === null) return '—'
  if (minutes < 60) return `${minutes}m`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
  return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`
}
</script>

<template>
  <PageHead
    eyebrow="Safety"
    title="Reports queue"
    lede="Critical first, then oldest first inside a priority — the order a backlog should actually be worked."
  >
    <template #actions>
      <el-checkbox v-model="filters.mine" size="small" label="Only mine" />
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <!-- Lane counts: the shape of the backlog before diving into it. -->
    <div v-if="summary" class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <button
        v-for="lane in PRIORITIES"
        :key="lane"
        type="button"
        class="panel px-3 py-2.5 text-left transition-colors"
        :class="filters.priority === lane ? 'border-[var(--color-signal)]' : 'hover:bg-[var(--color-raised)]'"
        @click="filters.priority = filters.priority === lane ? '' : lane"
      >
        <div class="eyebrow">{{ lane }}</div>
        <div
          class="text-[20px] font-semibold"
          :class="lane === 'critical' && summary[lane] > 0 ? 'text-[var(--color-signal)]' : ''"
        >
          {{ summary[lane] }}
        </div>
      </button>
      <div class="panel px-3 py-2.5">
        <div class="eyebrow">unassigned</div>
        <div class="text-[20px] font-semibold">{{ summary.unassigned }}</div>
      </div>
      <div class="panel px-3 py-2.5">
        <div class="eyebrow">yours</div>
        <div class="text-[20px] font-semibold">{{ summary.mine }}</div>
      </div>
    </div>

    <div class="mb-3 flex flex-wrap items-center gap-2">
      <el-select v-model="filters.status" placeholder="Open queue" size="small" clearable style="width: 160px">
        <el-option label="Open queue" value="" />
        <el-option v-for="s in ['open', 'assigned', 'escalated', 'actioned', 'dismissed']" :key="s" :label="s" :value="s" />
      </el-select>
      <el-select v-model="filters.category" placeholder="Any category" size="small" clearable style="width: 170px">
        <el-option v-for="c in CATEGORIES" :key="c" :label="c" :value="c" />
      </el-select>
    </div>

    <div class="panel">
      <EmptyState
        v-if="!loading && rows.length === 0"
        title="Nothing in the queue"
        body="Either nobody has reported anything matching these filters, or the queue is genuinely clear."
      />

      <el-table v-else :data="rows" style="width: 100%" @row-click="open">
        <el-table-column label="Priority" width="110">
          <template #default="{ row }">
            <el-tag :type="PRIORITY_TYPE[row.priority]" size="small">{{ row.priority }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Category" width="120">
          <template #default="{ row }"><span class="key">{{ row.category }}</span></template>
        </el-table-column>
        <el-table-column label="What was reported" min-width="280">
          <template #default="{ row }">
            <div class="truncate">{{ row.description ?? '—' }}</div>
            <div class="eyebrow">{{ row.target_type }} #{{ row.target_id }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Waiting" width="110" align="right">
          <template #default="{ row }">
            <span class="key" :class="(row.waiting_minutes ?? 0) > 1440 ? 'text-[var(--color-signal)]' : ''">
              {{ waited(row.waiting_minutes) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="Assigned" width="150">
          <template #default="{ row }">
            <span :class="row.assigned_to ? '' : 'text-[var(--color-legend)]'">
              {{ row.assigned_to ?? 'nobody' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="Status" width="110">
          <template #default="{ row }"><span class="key">{{ row.status }}</span></template>
        </el-table-column>
        <el-table-column label="Claim" width="150">
          <template #default="{ row }">
            <!-- C.3a. A lapsed claim reads as free with nothing having run. -->
            <template v-if="row.claimed_by">
              <div class="key">{{ row.claimed_by }}</div>
              <div class="eyebrow">{{ row.claim_expires_in_min }}m left</div>
            </template>
            <el-button v-else size="small" text :loading="busy" @click.stop="claim(row)">Claim</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>

  <!-- Detail -->
  <el-drawer v-model="drawer" size="560px" :title="detail ? `Report #${detail.report.id}` : 'Loading…'">
    <div v-if="detail" class="space-y-4">
      <section class="panel px-4 py-3">
        <div class="mb-2 flex items-center gap-2">
          <el-tag :type="PRIORITY_TYPE[detail.report.priority]" size="small">{{ detail.report.priority }}</el-tag>
          <span class="key">{{ detail.report.category }}</span>
          <span class="eyebrow ml-auto">waited {{ waited(detail.report.waiting_minutes) }}</span>
        </div>
        <p class="text-[13px]">{{ detail.report.description ?? 'No description given.' }}</p>
        <ul v-if="detail.report.evidence_urls?.length" class="mt-2 space-y-1">
          <li v-for="url in detail.report.evidence_urls" :key="url">
            <a :href="url" target="_blank" rel="noreferrer" class="key text-[var(--color-signal)]">{{ url }}</a>
          </li>
        </ul>
        <p v-if="detail.report.reporter" class="eyebrow mt-2">
          reported by {{ detail.report.reporter.guftagu_id }}
        </p>
      </section>

      <!-- Whether this is a first offence is the single most useful thing here. -->
      <section v-if="detail.target" class="panel px-4 py-3">
        <div class="eyebrow mb-2">Who this is about</div>
        <RouterLink :to="`/users/${detail.target.id}`" class="hover:text-[var(--color-signal)]">
          <div class="font-medium">{{ detail.target.display_name ?? detail.target.guftagu_id }}</div>
          <div class="key text-[var(--color-legend)]">{{ detail.target.guftagu_id }}</div>
        </RouterLink>
        <dl class="mt-3 grid grid-cols-3 gap-2 text-[13px]">
          <div><dt class="eyebrow">status</dt><dd>{{ detail.target.effective_status }}</dd></div>
          <div><dt class="eyebrow">prior sanctions</dt><dd>{{ detail.target.prior_sanctions }}</dd></div>
          <div><dt class="eyebrow">open reports</dt><dd>{{ detail.target.open_reports }}</dd></div>
        </dl>
        <p
          v-if="detail.target.status !== detail.target.effective_status"
          class="eyebrow mt-2 leading-relaxed"
        >
          the column still reads {{ detail.target.status }}; the sanction behind it has lapsed
        </p>
      </section>

      <p v-else-if="detail.target_note" class="panel px-4 py-3 text-[13px] text-[var(--color-legend)]">
        {{ detail.target_note }}
      </p>

      <!-- History -->
      <section v-if="detail.actions.length" class="panel">
        <div class="border-b border-[var(--color-edge)] px-4 py-2.5"><div class="eyebrow">What was done</div></div>
        <ul>
          <li
            v-for="a in detail.actions"
            :key="a.id"
            class="border-b border-[var(--color-edge)] px-4 py-2.5 last:border-b-0"
          >
            <div class="flex items-center gap-2">
              <span class="key" :class="a.reversed ? 'line-through opacity-60' : ''">{{ a.action }}</span>
              <span v-if="a.duration_minutes" class="eyebrow">{{ a.duration_minutes }}m</span>
              <span class="eyebrow ml-auto">{{ a.by }}</span>
              <el-button
                v-if="!a.reversed"
                v-permission="'moderation.reverse_action'"
                size="small"
                text
                :loading="busy"
                @click="reverse(a.id)"
              >
                Reverse
              </el-button>
            </div>
            <p class="mt-1 text-[13px] text-[var(--color-legend)]">{{ a.note }}</p>
            <p v-if="a.reversed" class="eyebrow mt-1">
              reversed by {{ a.reversed_by }} — {{ a.reversal_reason }}
            </p>
          </li>
        </ul>
      </section>

      <p
        v-if="detail.report.claimed_by && !detail.actionable_by_me"
        class="panel border-l-2 border-l-[var(--color-signal)] px-4 py-3 text-[13px]"
      >
        {{ detail.report.claimed_by }} is reviewing this report. It frees up in
        {{ detail.report.claim_expires_in_min }} minutes if they do not act.
      </p>

      <p v-if="detail.ban_policy?.note" class="eyebrow leading-relaxed">
        {{ detail.ban_policy.note }}
      </p>

      <div v-if="detail.report.is_open" class="flex flex-wrap gap-2">
        <el-button
          v-if="!detail.report.claimed_by"
          size="small"
          :loading="busy"
          @click="claim(detail.report)"
        >
          Claim
        </el-button>
        <el-button
          v-else-if="detail.actionable_by_me"
          size="small"
          :loading="busy"
          @click="releaseClaim(detail.report)"
        >
          Release claim
        </el-button>
        <el-button
          v-permission="'reports.action'"
          type="primary"
          :disabled="!detail.actionable_by_me"
          @click="startAction"
        >
          Take action
        </el-button>
        <el-button
          v-permission="'reports.action'"
          :disabled="!detail.actionable_by_me"
          :loading="busy"
          @click="dismiss"
        >
          Dismiss
        </el-button>
      </div>
      <p v-else class="eyebrow">
        resolved {{ detail.report.resolved_at }} by {{ detail.report.resolved_by }}
      </p>
    </div>
  </el-drawer>

  <!-- GFT-055 — the sanction dialog -->
  <el-dialog v-model="dialog" title="Action this report" width="480px">
    <el-form label-position="top">
      <el-form-item label="What happens">
        <el-select v-model="form.action" style="width: 100%">
          <el-option v-for="a in ACTIONS" :key="a.value" :label="a.label" :value="a.value" />
        </el-select>
        <p class="eyebrow mt-1 leading-relaxed">{{ chosenAction?.note }}</p>
      </el-form-item>

      <el-form-item v-if="chosenAction?.timed" label="For how long">
        <el-select v-model="form.duration_minutes" style="width: 100%">
          <el-option v-for="o in durationOptions" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
        <!-- C.4b — only what this moderator may actually issue is offered. -->
        <p v-if="policy?.ban.note" class="eyebrow mt-1 leading-relaxed">{{ policy.ban.note }}</p>
      </el-form-item>

      <el-form-item label="Note">
        <el-input
          v-model="form.note"
          type="textarea"
          :rows="3"
          placeholder="What happened and why this action fits."
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="dialog = false">Cancel</el-button>
      <el-button type="primary" :loading="busy" @click="submitAction">Apply</el-button>
    </template>
  </el-dialog>
</template>
