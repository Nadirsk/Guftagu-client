<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref, watch } from 'vue'

import EmptyState from '@/components/EmptyState.vue'
import PageHead from '@/components/PageHead.vue'
import { ApiError, api, http } from '@/lib/api'
import type { ExportRow, ReportCatalogue, ReportPreview, RevenueReconciliation } from '@/types/api'

/** GFT-112 — the report centre: builder, preview, downloads (A.10b, A.10c). */
const catalogue = ref<ReportCatalogue | null>(null)
const preview = ref<ReportPreview | null>(null)
const reconciliation = ref<RevenueReconciliation | null>(null)
const exports = ref<ExportRow[]>([])

const loading = ref(true)
const busy = ref(false)
const previewing = ref(false)

const type = ref('revenue')
const filters = ref({
  from: '',
  to: '',
  status: '',
  country: '',
  direction: '',
  min_amount: null as number | null,
})

/** Poll only while something is still building — no point hammering an idle screen. */
let poller: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  const now = new Date()
  filters.value.from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  filters.value.to = now.toISOString().slice(0, 10)

  await Promise.all([loadCatalogue(), loadExports()])
  loading.value = false
  await runPreview()
})

watch(type, async () => {
  preview.value = null
  reconciliation.value = null
  await runPreview()
})

async function loadCatalogue() {
  try {
    const { data } = await api.get<ReportCatalogue>('/admin/reports-centre')
    catalogue.value = data

    // A scoped account cannot run the revenue report, and it is not in their catalogue.
    // Landing on it anyway would greet them with a 403 on a screen that works fine.
    if (!data.types.some((t) => t.type === type.value)) {
      type.value = data.types[0]?.type ?? type.value
    }
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  }
}

async function loadExports() {
  try {
    const { data } = await api.get<ExportRow[]>('/admin/reports-centre/exports')
    exports.value = data

    const pending = data.some((e) => e.status === 'queued' || e.status === 'processing')

    if (pending && poller === null) {
      poller = setInterval(loadExports, 4000)
    }

    if (!pending && poller !== null) {
      clearInterval(poller)
      poller = null
    }
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  }
}

/** Only the filled-in filters — the backend refuses keys it does not recognise. */
function activeFilters(): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(filters.value)) {
    if (value !== '' && value !== null) out[key] = value
  }

  return out
}

async function runPreview() {
  previewing.value = true
  try {
    const { data } = await api.post<ReportPreview>('/admin/reports-centre/preview', {
      type: type.value,
      filters: activeFilters(),
    })
    preview.value = data

    if (type.value === 'revenue') await reconcile()
  } catch (e) {
    preview.value = null
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    previewing.value = false
  }
}

/** A.10b, as a check the operator can see rather than a promise in a doc. */
async function reconcile() {
  try {
    const { data } = await api.get<RevenueReconciliation>('/admin/reports-centre/reconcile', {
      from: filters.value.from || undefined,
      to: filters.value.to || undefined,
    })
    reconciliation.value = data
  } catch (e) {
    reconciliation.value = null
    if (e instanceof ApiError && e.code !== 'PERMISSION_DENIED') ElMessage.error(e.message)
  }
}

async function queueExport(format: 'csv' | 'pdf') {
  busy.value = true
  try {
    await api.post('/admin/reports-centre/export', {
      type: type.value,
      format,
      filters: activeFilters(),
    })
    ElMessage.success('Queued — it will appear below when it is ready')
    await loadExports()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
  } finally {
    busy.value = false
  }
}

/** PDF is laid out in memory and capped; CSV streams and handles any size. */
const overPdfCap = computed(
  () => catalogue.value !== null && (preview.value?.total ?? 0) > catalogue.value.pdf_row_cap,
)

const downloading = ref<Record<string, boolean>>({})

// A plain `<a href>` would navigate the browser straight to the API, with no Authorization
// header — auth here is a bearer token in localStorage, not a cookie, so that request lands
// unauthenticated. Fetch it through the same axios instance instead, then hand the browser
// the bytes as a blob.
async function download(row: ExportRow) {
  downloading.value[row.uuid] = true
  try {
    const response = await http.get(`/admin/reports-centre/exports/${row.uuid}/download`, {
      responseType: 'blob',
    })
    const disposition = response.headers['content-disposition'] as string | undefined
    const filename = disposition?.match(/filename="?([^";]+)"?/)?.[1] ?? `${row.type}-report.${row.format}`

    const url = URL.createObjectURL(response.data as Blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : 'Could not download that export.')
  } finally {
    downloading.value[row.uuid] = false
  }
}

const STATUS_TYPE: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
  ready: 'success',
  processing: 'warning',
  queued: 'info',
  failed: 'danger',
}
</script>

<template>
  <PageHead
    eyebrow="Money"
    title="Report centre"
    lede="Build it, check it against the ledger, then export. Large exports are queued and streamed."
  >
    <template #actions>
      <el-button size="small" :loading="previewing" @click="runPreview">Refresh</el-button>
      <el-button size="small" type="primary" :loading="busy" @click="queueExport('csv')">Export CSV</el-button>
      <el-tooltip
        :disabled="!overPdfCap"
        :content="`Too many rows for PDF (cap is ${catalogue?.pdf_row_cap.toLocaleString()}). Use CSV instead.`"
      >
        <span>
          <el-button
            size="small"
            :disabled="overPdfCap"
            :loading="busy"
            @click="queueExport('pdf')"
          >
            Export PDF
          </el-button>
        </span>
      </el-tooltip>
    </template>
  </PageHead>

  <div v-loading="loading" class="px-5 py-5 md:px-7">
    <div class="grid gap-4 lg:grid-cols-[260px_1fr]">
      <!-- Builder -->
      <aside class="panel h-fit">
        <div class="border-b border-[var(--color-edge)] px-4 py-2.5"><div class="eyebrow">Report</div></div>

        <ul>
          <li v-for="t in catalogue?.types ?? []" :key="t.type">
            <button
              type="button"
              class="w-full border-l-2 px-4 py-2.5 text-left transition-colors"
              :class="
                type === t.type
                  ? 'border-l-[var(--color-signal)] bg-[var(--color-raised)]'
                  : 'border-l-transparent hover:bg-[var(--color-raised)]'
              "
              @click="type = t.type"
            >
              <span class="key block">{{ t.type }}</span>
              <span class="eyebrow">{{ t.columns.length }} columns</span>
            </button>
          </li>
        </ul>

        <div class="space-y-2 border-t border-[var(--color-edge)] px-4 py-3">
          <div class="eyebrow">Range</div>
          <el-input v-model="filters.from" type="date" size="small" @change="runPreview" />
          <el-input v-model="filters.to" type="date" size="small" @change="runPreview" />

          <template v-if="type === 'users'">
            <div class="eyebrow pt-1">Status</div>
            <el-select v-model="filters.status" size="small" clearable placeholder="Any" style="width: 100%" @change="runPreview">
              <el-option v-for="s in ['active', 'suspended', 'banned']" :key="s" :label="s" :value="s" />
            </el-select>
            <el-input v-model="filters.country" size="small" placeholder="Country" @change="runPreview" />
          </template>

          <template v-if="type === 'transactions'">
            <div class="eyebrow pt-1">Direction</div>
            <el-select v-model="filters.direction" size="small" clearable placeholder="Any" style="width: 100%" @change="runPreview">
              <el-option label="Credit" value="credit" />
              <el-option label="Debit" value="debit" />
            </el-select>
            <el-input-number v-model="filters.min_amount" size="small" :min="0" placeholder="Min amount" style="width: 100%" @change="runPreview" />
          </template>
        </div>

        <p v-if="catalogue" class="eyebrow border-t border-[var(--color-edge)] px-4 py-2 leading-relaxed">
          {{ catalogue.note }}
        </p>
      </aside>

      <div class="space-y-4">
        <!-- A scoped account should be told it is one, so a short list reads as a
             boundary rather than as missing data. -->
        <p
          v-if="catalogue?.scope"
          class="panel border-l-2 border-l-[var(--color-signal)] px-4 py-3 text-[13px]"
        >
          {{ catalogue.scope.note }}
        </p>

        <!-- A.10b -->
        <div
          v-if="reconciliation"
          class="panel border-l-2 px-4 py-3"
          :class="reconciliation.matches ? 'border-l-[var(--color-ok)]' : 'border-l-[var(--color-signal)]'"
        >
          <div class="flex flex-wrap items-baseline gap-x-4">
            <span class="key font-bold">
              {{ reconciliation.matches ? 'Agrees with the dashboard rollup' : 'Differs from the dashboard rollup' }}
            </span>
            <span class="eyebrow">ledger {{ reconciliation.ledger_coins.toLocaleString() }}</span>
            <span class="eyebrow">rollup {{ reconciliation.rollup_coins.toLocaleString() }}</span>
            <span class="eyebrow">difference {{ reconciliation.difference.toLocaleString() }}</span>
          </div>
          <p class="eyebrow mt-1 leading-relaxed">{{ reconciliation.note }}</p>
        </div>

        <!-- Preview -->
        <section v-loading="previewing" class="panel">
          <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-edge)] px-4 py-2.5">
            <div class="eyebrow">{{ type }} · {{ filters.from }} → {{ filters.to }}</div>
            <div v-if="preview" class="key">{{ preview.total.toLocaleString() }} rows</div>
          </div>

          <EmptyState
            v-if="preview && preview.rows.length === 0"
            title="Nothing in this range"
            body="Widen the dates, or clear a filter."
          />

          <div v-else-if="preview" class="overflow-x-auto">
            <table class="w-full text-[13px]">
              <thead>
                <tr class="border-b border-[var(--color-edge)]">
                  <th
                    v-for="col in preview.columns"
                    :key="col"
                    class="eyebrow px-3 py-2 text-left whitespace-nowrap"
                  >
                    {{ col.replace(/_/g, ' ') }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, i) in preview.rows"
                  :key="i"
                  class="border-b border-[var(--color-edge)] last:border-b-0"
                >
                  <td v-for="col in preview.columns" :key="col" class="key px-3 py-1.5 whitespace-nowrap">
                    {{ row[col] ?? '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p v-if="preview?.note" class="eyebrow border-t border-[var(--color-edge)] px-4 py-2 leading-relaxed">
            {{ preview.note }}
          </p>
        </section>

        <!-- Downloads -->
        <section class="panel">
          <div class="border-b border-[var(--color-edge)] px-4 py-2.5"><div class="eyebrow">Your downloads</div></div>

          <EmptyState
            v-if="exports.length === 0"
            title="Nothing exported yet"
            body="Exports are built by a worker, so a large one does not block you."
          />

          <el-table v-else :data="exports" style="width: 100%">
            <el-table-column label="Report" width="150">
              <template #default="{ row }">
                <span class="key">{{ row.type }}</span>
                <el-tag size="small" :type="row.format === 'pdf' ? 'warning' : 'info'" class="ml-1">
                  {{ row.format }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Rows" width="110" align="right">
              <template #default="{ row }">
                <span class="key">{{ row.row_count === null ? '—' : row.row_count.toLocaleString() }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Built" min-width="170">
              <template #default="{ row }">
                <span class="key text-[var(--color-legend)]">{{ row.created_at?.slice(0, 16).replace('T', ' ') }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Expires" min-width="140">
              <template #default="{ row }">
                <span class="eyebrow">{{ row.expires_at?.slice(0, 10) ?? '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Status" width="130">
              <template #default="{ row }">
                <el-tag :type="STATUS_TYPE[row.status]" size="small">{{ row.status }}</el-tag>
                <div v-if="row.error" class="eyebrow mt-1">{{ row.error }}</div>
              </template>
            </el-table-column>
            <el-table-column width="120" align="right">
              <template #default="{ row }">
                <a
                  v-if="row.downloadable"
                  href="#"
                  class="text-[13px] text-[var(--color-signal)] hover:underline"
                  :class="{ 'pointer-events-none opacity-50': downloading[row.uuid] }"
                  @click.prevent="download(row)"
                >
                  {{ downloading[row.uuid] ? 'Downloading…' : 'Download' }}
                </a>
                <span v-else-if="row.status === 'ready'" class="eyebrow">expired</span>
              </template>
            </el-table-column>
          </el-table>

          <p class="eyebrow border-t border-[var(--color-edge)] px-4 py-2 leading-relaxed">
            exports of financial and personal data are kept for seven days, then removed
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
