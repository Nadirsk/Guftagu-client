<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import type {
  CannedReplyRow,
  SupportSummary,
  SupportTicketDetail,
  SupportTicketRow,
} from '@/types/api'

/** GFT-145 — the support inbox: conversation view, canned replies, status (epic B.4). */
const rows = ref<SupportTicketRow[]>([])
const summary = ref<SupportSummary | null>(null)
const detail = ref<SupportTicketDetail | null>(null)
const canned = ref<CannedReplyRow[]>([])
const admins = ref<Array<{ id: number; name: string }>>([])

const loading = ref(true)
const busy = ref(false)
const drawer = ref(false)

const filters = ref({ status: '', priority: '', sla: '', mine: false, q: '' })

const reply = ref({ body: '', is_internal: false })

/** Amber for at risk, red for breached — the same signal vocabulary as everywhere else. */
const SLA_TYPE: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
  on_track: 'success',
  at_risk: 'warning',
  response_breached: 'danger',
  resolution_breached: 'danger',
  closed: 'info',
}

const SLA_LABEL: Record<string, string> = {
  on_track: 'on track',
  at_risk: 'at risk',
  response_breached: 'late',
  resolution_breached: 'overdue',
  closed: 'closed',
}

const PRIORITY_TYPE: Record<string, 'danger' | 'warning' | 'info' | ''> = {
  urgent: 'danger',
  high: 'warning',
  medium: '',
  low: 'info',
}

onMounted(async () => {
  await Promise.all([load(), loadSummary(), loadCanned(), loadAdmins()])
  loading.value = false
})

watch(filters, load, { deep: true })

async function load() {
  try {
    const { data } = await api.get<SupportTicketRow[]>('/admin/support', {
      status: filters.value.status || undefined,
      priority: filters.value.priority || undefined,
      sla: filters.value.sla || undefined,
      mine: filters.value.mine || undefined,
      q: filters.value.q || undefined,
      per_page: 50,
    })
    rows.value = data
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  }
}

async function loadSummary() {
  try {
    const { data } = await api.get<SupportSummary>('/admin/support/summary')
    summary.value = data
  } catch {
    // The tiles are a convenience; the inbox works without them.
  }
}

async function loadCanned() {
  try {
    const { data } = await api.get<CannedReplyRow[]>('/admin/support/canned-replies')
    canned.value = data
  } catch {
    // Saved replies are optional; typing still works.
  }
}

async function loadAdmins() {
  try {
    const { data } = await api.get<Array<{ id: number; name: string }>>('/admin/panel-users', {
      per_page: 100,
    })
    admins.value = data
  } catch {
    // Without the list, assignment and escalation fall back to typing an id.
  }
}

async function open(row: SupportTicketRow) {
  drawer.value = true
  detail.value = null
  reply.value = { body: '', is_internal: false }

  try {
    const { data } = await api.get<SupportTicketDetail>(`/admin/support/${row.id}`)
    detail.value = data
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

async function send() {
  if (!detail.value || reply.value.body.trim().length === 0) return

  busy.value = true
  try {
    const { data } = await api.post<{ note: string | null }>(
      `/admin/support/${detail.value.ticket.id}/reply`,
      { body: reply.value.body.trim(), is_internal: reply.value.is_internal },
    )

    // The surprising half of the rule, said out loud rather than left to be discovered
    // when the SLA report looks wrong.
    if (data.note) ElMessage.warning(data.note)
    else ElMessage.success('Reply sent')

    reply.value.body = ''
    await Promise.all([open(detail.value.ticket), load(), loadSummary()])
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

function useCanned(row: CannedReplyRow) {
  reply.value.body = row.body_en
}

async function resolve() {
  if (!detail.value) return

  const resolution = window.prompt('How was this resolved? The person who raised it is told.')
  if (resolution === null || resolution.trim().length < 3) return

  await act(() => api.post(`/admin/support/${detail.value!.ticket.id}/resolve`, {
    resolution: resolution.trim(),
  }))
}

async function assign(adminId: number) {
  if (!detail.value) return

  await act(() => api.post(`/admin/support/${detail.value!.ticket.id}/assign`, {
    admin_user_id: adminId,
  }))
}

async function escalate() {
  if (!detail.value) return

  const adminId = window.prompt('Escalate to which admin id?')
  if (adminId === null || !adminId.trim()) return

  const note = window.prompt('What is stuck? The named admin is notified.')
  if (note === null || note.trim().length < 3) return

  await act(async () => {
    const { data } = await api.post<{ note: string }>(
      `/admin/support/${detail.value!.ticket.id}/escalate`,
      { admin_user_id: Number(adminId), note: note.trim() },
    )
    ElMessage.info(data.note)
  })
}

async function act(fn: () => Promise<unknown>) {
  busy.value = true
  try {
    await fn()
    ElMessage.success('Done')
    if (detail.value) await open(detail.value.ticket)
    await Promise.all([load(), loadSummary()])
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

/** "late by 40m" is more useful in a queue than a raw negative number. */
function dueLabel(minutes: number | null): string {
  if (minutes === null) return '—'
  if (minutes < 0) return `late by ${describe(-minutes)}`
  return `${describe(minutes)} left`
}

function describe(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
  return `${Math.floor(minutes / 1440)}d`
}

const canReply = computed(() => detail.value?.ticket.is_open ?? false)
</script>

<template>
  <PageHead
    eyebrow="Support"
    title="Support inbox"
    lede="Urgent first, then oldest. Each ticket is judged against the promise that applied when it was raised."
  >
    <template #actions>
      <el-checkbox v-model="filters.mine" size="small" label="Only mine" />
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <div v-if="summary" class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <div class="panel px-3 py-2.5">
        <div class="eyebrow">open</div>
        <div class="stat-figure text-[20px]">{{ summary.open }}</div>
      </div>
      <button
        type="button"
        class="panel px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-raised)]"
        :class="filters.sla === 'unanswered' ? 'border-[var(--color-signal)]' : ''"
        @click="filters.sla = filters.sla === 'unanswered' ? '' : 'unanswered'"
      >
        <div class="eyebrow">unanswered</div>
        <div class="stat-figure text-[20px]">{{ summary.unanswered }}</div>
      </button>
      <button
        type="button"
        class="panel px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-raised)]"
        :class="filters.sla === 'breaching' ? 'border-[var(--color-signal)]' : ''"
        @click="filters.sla = filters.sla === 'breaching' ? '' : 'breaching'"
      >
        <div class="eyebrow">late</div>
        <div
          class="stat-figure text-[20px]"
          :class="summary.breaching > 0 ? 'text-[var(--color-signal)]' : ''"
        >
          {{ summary.breaching }}
        </div>
      </button>
      <div class="panel px-3 py-2.5">
        <div class="eyebrow">urgent</div>
        <div class="stat-figure text-[20px]">{{ summary.urgent }}</div>
      </div>
      <div class="panel px-3 py-2.5">
        <div class="eyebrow">unassigned</div>
        <div class="stat-figure text-[20px]">{{ summary.unassigned }}</div>
      </div>
      <button
        type="button"
        class="panel px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-raised)]"
        :class="filters.sla === 'escalated' ? 'border-[var(--color-signal)]' : ''"
        @click="filters.sla = filters.sla === 'escalated' ? '' : 'escalated'"
      >
        <div class="eyebrow">escalated</div>
        <div class="stat-figure text-[20px]">{{ summary.escalated }}</div>
      </button>
    </div>

    <div class="mb-3 flex flex-wrap items-center gap-2">
      <el-input v-model="filters.q" placeholder="Ref or subject" size="small" clearable style="width: 220px" />
      <el-select v-model="filters.status" placeholder="Open" size="small" clearable style="width: 140px">
        <el-option v-for="s in ['open', 'pending', 'resolved', 'closed']" :key="s" :label="s" :value="s" />
      </el-select>
      <el-select v-model="filters.priority" placeholder="Any priority" size="small" clearable style="width: 150px">
        <el-option v-for="p in ['urgent', 'high', 'medium', 'low']" :key="p" :label="p" :value="p" />
      </el-select>
    </div>

    <div class="panel">
      <EmptyState
        v-if="rows.length === 0"
        title="Nothing in the inbox"
        body="Either every ticket has been handled, or nothing matches these filters."
      />

      <el-table v-else :data="rows" style="width: 100%" @row-click="open">
        <el-table-column label="Ref" width="120">
          <template #default="{ row }"><span class="key">{{ row.ref }}</span></template>
        </el-table-column>
        <el-table-column label="Subject" min-width="240">
          <template #default="{ row }">
            <div class="truncate font-medium">{{ row.subject }}</div>
            <div class="eyebrow">{{ row.category }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Who" min-width="150">
          <template #default="{ row }">
            <RouterLink
              v-if="row.user"
              :to="`/users/${row.user.id}`"
              class="hover:text-[var(--color-signal)]"
              @click.stop
            >
              <div>{{ row.user.display_name ?? row.user.guftagu_id }}</div>
              <div class="key text-[var(--color-legend)]">{{ row.user.guftagu_id }}</div>
            </RouterLink>
            <span v-else class="eyebrow">no account linked</span>
          </template>
        </el-table-column>
        <el-table-column label="Priority" width="110">
          <template #default="{ row }">
            <el-tag :type="PRIORITY_TYPE[row.priority]" size="small">{{ row.priority }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="First reply" width="150">
          <template #default="{ row }">
            <span v-if="row.first_response_minutes !== null" class="key">
              answered in {{ describe(row.first_response_minutes) }}
            </span>
            <span
              v-else
              class="key"
              :class="(row.first_response_due_in ?? 0) < 0 ? 'text-[var(--color-signal)]' : ''"
            >
              {{ dueLabel(row.first_response_due_in) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="SLA" width="110">
          <template #default="{ row }">
            <el-tag :type="SLA_TYPE[row.sla_state]" size="small">{{ SLA_LABEL[row.sla_state] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Assigned" width="140">
          <template #default="{ row }">
            <span :class="row.assigned_to ? '' : 'text-[var(--color-legend)]'">
              {{ row.assigned_to ?? 'nobody' }}
            </span>
            <el-tag v-if="row.escalated" size="small" type="warning" class="ml-1">up</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>

  <!-- Conversation -->
  <el-drawer v-model="drawer" size="620px" :title="detail ? `${detail.ticket.ref} · ${detail.ticket.subject}` : 'Loading…'">
    <div v-if="detail" class="space-y-4">
      <section class="panel px-4 py-3">
        <div class="mb-2 flex flex-wrap items-center gap-2">
          <el-tag :type="PRIORITY_TYPE[detail.ticket.priority]" size="small">{{ detail.ticket.priority }}</el-tag>
          <span class="key">{{ detail.ticket.category }}</span>
          <el-tag :type="SLA_TYPE[detail.sla.state]" size="small">{{ SLA_LABEL[detail.sla.state] }}</el-tag>
          <span class="eyebrow ml-auto">{{ detail.ticket.status }}</span>
        </div>

        <dl class="grid grid-cols-2 gap-2 text-[13px]">
          <div>
            <dt class="eyebrow">promise</dt>
            <dd class="key">{{ describe(detail.sla.promise_minutes) }}</dd>
          </div>
          <div>
            <dt class="eyebrow">first reply</dt>
            <dd class="key">
              {{
                detail.sla.first_response_minutes !== null
                  ? describe(detail.sla.first_response_minutes)
                  : dueLabel(detail.sla.first_response_due_in)
              }}
            </dd>
          </div>
        </dl>

        <p class="eyebrow mt-2 leading-relaxed">{{ detail.sla.note }}</p>

        <p v-if="detail.ticket.escalation_note" class="mt-2 text-[13px]">
          <span class="eyebrow">escalated to {{ detail.ticket.escalated_to }}:</span>
          {{ detail.ticket.escalation_note }}
        </p>
      </section>

      <!-- Thread -->
      <section class="panel">
        <div class="border-b border-[var(--color-edge)] px-4 py-2.5"><div class="eyebrow">Conversation</div></div>
        <ul class="flex max-h-[440px] flex-col gap-2.5 overflow-y-auto p-4">
          <li v-for="m in detail.messages" :key="m.id">
            <!-- A system event is neither side of the chat, so it never gets a bubble. -->
            <div v-if="m.sender_type === 'system'" class="flex justify-center">
              <span class="eyebrow rounded-full bg-[var(--color-raised)] px-3 py-1">
                {{ m.body }} · {{ m.created_at?.slice(0, 16).replace('T', ' ') }}
              </span>
            </div>

            <!-- Marked plainly and kept OUT of the bubble flow entirely. An internal note
                 rendered like a reply is how a private remark ends up quoted back at the
                 customer, so it renders as a full-width note, not a message from either side. -->
            <div
              v-else-if="m.is_internal"
              class="rounded-lg border border-dashed border-[var(--color-signal)] bg-[var(--color-signal-dim)] px-3 py-2"
            >
              <div class="flex items-baseline gap-2">
                <el-tag size="small" type="warning">internal note</el-tag>
                <span class="eyebrow">{{ m.sender ?? 'admin' }}</span>
                <span class="eyebrow ml-auto">{{ m.created_at?.slice(0, 16).replace('T', ' ') }}</span>
              </div>
              <p class="mt-1 text-[13px] whitespace-pre-line">{{ m.body }}</p>
            </div>

            <div v-else class="flex" :class="m.sender_type === 'admin' ? 'justify-end' : 'justify-start'">
              <div
                class="max-w-[75%] rounded-2xl px-3 py-2"
                :class="m.sender_type === 'admin'
                  ? 'rounded-br-sm bg-[var(--color-signal)] text-white'
                  : 'rounded-bl-sm bg-[var(--color-raised)]'"
              >
                <div class="flex items-baseline gap-2">
                  <span
                    class="text-[11px] font-medium uppercase tracking-wide"
                    :class="m.sender_type === 'admin' ? 'text-white/70' : 'text-[var(--color-legend)]'"
                  >
                    {{ m.sender ?? m.sender_type }}
                  </span>
                </div>
                <p class="mt-0.5 text-[13px] whitespace-pre-line">{{ m.body }}</p>
                <div
                  class="mt-1 text-right text-[11px]"
                  :class="m.sender_type === 'admin' ? 'text-white/60' : 'text-[var(--color-legend)]'"
                >
                  {{ m.created_at?.slice(0, 16).replace('T', ' ') }}
                </div>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <!-- Reply -->
      <section v-if="canReply" class="panel px-4 py-3">
        <div class="eyebrow mb-2">Reply</div>

        <el-input v-model="reply.body" type="textarea" :rows="4" placeholder="Write a reply." />

        <div v-if="canned.length" class="mt-2 flex flex-wrap gap-1">
          <el-button
            v-for="c in canned"
            :key="c.id"
            size="small"
            text
            @click="useCanned(c)"
          >
            {{ c.title }}
          </el-button>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-2">
          <el-checkbox v-model="reply.is_internal" size="small" label="Internal note" />
          <span v-if="reply.is_internal" class="eyebrow">
            staff only — does not stop the response clock
          </span>
          <el-button
            v-permission="'support.reply'"
            type="primary"
            size="small"
            class="ml-auto"
            :loading="busy"
            @click="send"
          >
            {{ reply.is_internal ? 'Save note' : 'Send reply' }}
          </el-button>
        </div>
      </section>

      <div class="flex flex-wrap gap-2">
        <el-select
          v-permission.disable="'support.assign'"
          placeholder="Assign to"
          size="small"
          style="width: 180px"
          @change="assign"
        >
          <el-option v-for="a in admins" :key="a.id" :label="a.name" :value="a.id" />
        </el-select>
        <el-button v-if="canReply" v-permission="'support.escalate'" size="small" :loading="busy" @click="escalate">
          Escalate
        </el-button>
        <el-button v-if="canReply" v-permission="'support.reply'" size="small" :loading="busy" @click="resolve">
          Resolve
        </el-button>
      </div>

      <p v-if="detail.ticket.resolution" class="panel px-4 py-3 text-[13px]">
        <span class="eyebrow">resolved by {{ detail.ticket.resolved_by }}:</span>
        {{ detail.ticket.resolution }}
      </p>
    </div>
  </el-drawer>
</template>
