<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, ref, watch } from 'vue'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api } from '@/lib/api'
import type { AuditCoverage, AuditFilters, AuditLogDetail, AuditLogRow } from '@/types/api'

/** GFT-113 — the audit-log viewer with diff rendering (A.10d). */
const rows = ref<AuditLogRow[]>([])
const options = ref<AuditFilters | null>(null)
const coverage = ref<AuditCoverage | null>(null)
const detail = ref<AuditLogDetail | null>(null)

const loading = ref(true)
const drawer = ref(false)
const showCoverage = ref(false)

const filters = ref({
  q: '',
  admin_user_id: '' as number | '',
  module: '',
  action: '',
  source: '',
  from: '',
  to: '',
})

onMounted(async () => {
  await Promise.all([load(), loadOptions(), loadCoverage()])
  loading.value = false
})

watch(filters, load, { deep: true })

async function load() {
  try {
    const { data } = await api.get<AuditLogRow[]>('/admin/audit-logs', {
      q: filters.value.q || undefined,
      admin_user_id: filters.value.admin_user_id || undefined,
      module: filters.value.module || undefined,
      action: filters.value.action || undefined,
      source: filters.value.source || undefined,
      from: filters.value.from || undefined,
      to: filters.value.to || undefined,
      per_page: 100,
    })
    rows.value = data
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  }
}

async function loadOptions() {
  try {
    const { data } = await api.get<AuditFilters>('/admin/audit-logs/filters')
    options.value = data
  } catch {
    // The filter dropdowns degrade to free text; the list still works.
  }
}

async function loadCoverage() {
  try {
    const { data } = await api.get<AuditCoverage>('/admin/audit-logs/coverage')
    coverage.value = data
  } catch {
    // Coverage is a nice-to-have on this screen, not a blocker.
  }
}

async function open(row: AuditLogRow) {
  drawer.value = true
  detail.value = null

  try {
    const { data } = await api.get<AuditLogDetail>(`/admin/audit-logs/${row.id}`)
    detail.value = data
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  }
}

/** Objects and arrays get JSON; everything else is printed as it reads. */
function render(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}
</script>

<template>
  <PageHead
    eyebrow="Access"
    title="Audit trail"
    lede="Every admin mutation, with who did it, what changed, and from where. Append-only — nothing here can be edited or removed."
  >
    <template #actions>
      <el-button size="small" @click="showCoverage = !showCoverage">
        {{ showCoverage ? 'Hide' : 'Show' }} coverage
      </el-button>
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <!-- How much of the trail carries a real diff. -->
    <section v-if="showCoverage && coverage" class="panel mb-4">
      <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
        <div class="eyebrow">Coverage since {{ coverage.since }}</div>
      </div>

      <div class="flex flex-wrap gap-6 px-4 py-3">
        <div>
          <div class="stat-figure text-[20px]">{{ coverage.total.toLocaleString() }}</div>
          <div class="eyebrow">entries</div>
        </div>
        <div>
          <div class="stat-figure text-[20px] text-[var(--color-ok)]">{{ coverage.explicit.toLocaleString() }}</div>
          <div class="eyebrow">with a real diff</div>
        </div>
        <div>
          <div
            class="stat-figure text-[20px]"
            :class="coverage.fallback > 0 ? 'text-[var(--color-signal)]' : ''"
          >
            {{ coverage.fallback.toLocaleString() }}
          </div>
          <div class="eyebrow">safety-net only</div>
        </div>
      </div>

      <ul class="border-t border-[var(--color-edge)]">
        <li
          v-for="m in coverage.modules"
          :key="m.module"
          class="flex items-center gap-3 border-b border-[var(--color-edge)] px-4 py-2 last:border-b-0"
        >
          <span class="key w-32 shrink-0">{{ m.module }}</span>
          <div class="flex h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-edge)]">
            <div class="h-full bg-[var(--color-ok)]" :style="{ width: `${(m.explicit / m.total) * 100}%` }" />
            <div class="h-full bg-[var(--color-signal)]" :style="{ width: `${(m.fallback / m.total) * 100}%` }" />
          </div>
          <span class="eyebrow w-24 text-right">{{ m.total.toLocaleString() }} entries</span>
        </li>
      </ul>

      <p class="eyebrow border-t border-[var(--color-edge)] px-4 py-2 leading-relaxed">
        {{ coverage.note }}
      </p>
    </section>

    <div class="mb-3 flex flex-wrap items-center gap-2">
      <el-input
        v-model="filters.q"
        placeholder="Action, entity id, IP or request id"
        size="small"
        clearable
        style="width: 260px"
      />
      <el-select v-model="filters.admin_user_id" placeholder="Any actor" size="small" clearable style="width: 170px">
        <el-option v-for="a in options?.actors ?? []" :key="a.id" :label="a.name" :value="a.id" />
      </el-select>
      <el-select v-model="filters.module" placeholder="Any module" size="small" clearable style="width: 150px">
        <el-option v-for="m in options?.modules ?? []" :key="m" :label="m" :value="m" />
      </el-select>
      <el-select v-model="filters.source" placeholder="Any source" size="small" clearable style="width: 150px">
        <el-option label="Explicit (has diff)" value="service" />
        <el-option label="Safety net" value="middleware" />
      </el-select>
      <el-input v-model="filters.from" type="date" size="small" style="width: 150px" />
      <el-input v-model="filters.to" type="date" size="small" style="width: 150px" />
      <span v-if="options" class="eyebrow ml-auto">{{ options.total.toLocaleString() }} entries on record</span>
    </div>

    <div class="panel">
      <EmptyState
        v-if="rows.length === 0"
        title="Nothing matches"
        body="Widen the dates, or clear a filter."
      />

      <el-table v-else :data="rows" style="width: 100%" @row-click="open">
        <el-table-column label="When" width="170">
          <template #default="{ row }">
            <span class="key text-[var(--color-legend)]">
              {{ row.created_at?.slice(0, 19).replace('T', ' ') }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="Who" width="150">
          <template #default="{ row }">
            <span :class="row.actor === 'system' ? 'text-[var(--color-legend)]' : ''">{{ row.actor }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Did" min-width="200">
          <template #default="{ row }"><span class="key">{{ row.action }}</span></template>
        </el-table-column>
        <el-table-column label="To" min-width="160">
          <template #default="{ row }">
            <span v-if="row.entity_type" class="key text-[var(--color-legend)]">
              {{ row.entity_type }} #{{ row.entity_id }}
            </span>
            <span v-else class="eyebrow">—</span>
          </template>
        </el-table-column>
        <el-table-column label="Module" width="120">
          <template #default="{ row }"><span class="eyebrow">{{ row.module }}</span></template>
        </el-table-column>
        <el-table-column label="Diff" width="110">
          <template #default="{ row }">
            <!-- A safety-net row is real evidence that something happened, but it cannot
                 say what changed. Worth distinguishing at a glance. -->
            <el-tag v-if="row.source === 'service'" size="small" type="success">recorded</el-tag>
            <el-tag v-else size="small" type="warning">no diff</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="From" width="130">
          <template #default="{ row }"><span class="key text-[var(--color-legend)]">{{ row.ip ?? '—' }}</span></template>
        </el-table-column>
      </el-table>
    </div>
  </div>

  <el-drawer v-model="drawer" size="620px" :title="detail ? detail.log.action : 'Loading…'">
    <div v-if="detail" class="space-y-4">
      <section class="panel px-4 py-3">
        <dl class="grid grid-cols-2 gap-3 text-[13px]">
          <div><dt class="eyebrow">actor</dt><dd>{{ detail.log.actor }}</dd></div>
          <div><dt class="eyebrow">email</dt><dd class="key">{{ detail.log.actor_email ?? '—' }}</dd></div>
          <div><dt class="eyebrow">module</dt><dd class="key">{{ detail.log.module }}</dd></div>
          <div><dt class="eyebrow">when</dt><dd class="key">{{ detail.log.created_at?.slice(0, 19).replace('T', ' ') }}</dd></div>
          <div><dt class="eyebrow">entity</dt><dd class="key">{{ detail.log.entity_type ?? '—' }}</dd></div>
          <div><dt class="eyebrow">entity id</dt><dd class="key">{{ detail.log.entity_id ?? '—' }}</dd></div>
          <div><dt class="eyebrow">ip</dt><dd class="key">{{ detail.log.ip ?? '—' }}</dd></div>
          <div><dt class="eyebrow">request</dt><dd class="key truncate">{{ detail.log.request_id ?? '—' }}</dd></div>
        </dl>
        <p v-if="detail.log.user_agent" class="eyebrow mt-2 leading-relaxed">{{ detail.log.user_agent }}</p>
      </section>

      <p v-if="detail.source_note" class="panel border-l-2 border-l-[var(--color-signal)] px-4 py-3 text-[13px]">
        {{ detail.source_note }}
      </p>

      <!-- The diff. Only fields that actually moved. -->
      <section v-if="detail.changes.length" class="panel">
        <div class="border-b border-[var(--color-edge)] px-4 py-2.5"><div class="eyebrow">What changed</div></div>
        <ul>
          <li
            v-for="change in detail.changes"
            :key="change.field"
            class="border-b border-[var(--color-edge)] px-4 py-2.5 last:border-b-0"
          >
            <div class="eyebrow mb-1">{{ change.field.replace(/_/g, ' ') }}</div>
            <div class="grid grid-cols-[1fr_auto_1fr] items-start gap-2 text-[13px]">
              <span class="key break-all text-[var(--color-legend)] line-through decoration-1">
                {{ render(change.from) }}
              </span>
              <span class="text-[var(--color-legend)]">→</span>
              <span class="key break-all">{{ render(change.to) }}</span>
            </div>
            <p v-if="change.kind === 'recorded_before_only'" class="eyebrow mt-1">
              only the prior value was recorded — this is not a deletion
            </p>
          </li>
        </ul>
      </section>

      <p v-else class="panel px-4 py-3 text-[13px] text-[var(--color-legend)]">
        No field-level diff was recorded for this entry.
      </p>

      <section v-if="detail.related.length" class="panel">
        <div class="border-b border-[var(--color-edge)] px-4 py-2.5">
          <div class="eyebrow">Also in the same request</div>
        </div>
        <ul>
          <li
            v-for="r in detail.related"
            :key="r.id"
            class="flex gap-2 border-b border-[var(--color-edge)] px-4 py-2 last:border-b-0"
          >
            <span class="key">{{ r.action }}</span>
            <span class="eyebrow ml-auto">{{ r.module }}</span>
          </li>
        </ul>
      </section>
    </div>
  </el-drawer>
</template>
